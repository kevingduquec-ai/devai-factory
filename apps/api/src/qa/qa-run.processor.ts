import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret } from "../common/crypto";
import { executeQaCase } from "./playwright-runner";
import { buildQaReport, type QaReportCase } from "./qa-report-builder";
import { QA_RUN_QUEUE } from "./qa.constants";
import type { QaStep } from "./qa-step.types";

export interface QaRunJobData {
  runId: string;
  orgId: string;
}

const EVIDENCE_DIR = join(process.cwd(), "storage", "qa-evidence");
const REPORT_DIR = join(process.cwd(), "storage", "qa-reports");

@Processor(QA_RUN_QUEUE)
export class QaRunProcessor extends WorkerHost {
  private readonly logger = new Logger(QaRunProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<QaRunJobData>): Promise<void> {
    const { runId, orgId } = job.data;
    const db = this.prisma.forOrg(orgId);

    const run = await db.qaTestRun.findUniqueOrThrow({ where: { id: runId }, include: { module: true } });
    const setupSteps = (run.module.setupSteps ?? []) as unknown as QaStep[];

    const readyCases = await db.qaTestCase.findMany({
      where: { moduleId: run.moduleId, status: "ready" },
      orderBy: { code: "asc" },
      include: { missingDataRequests: { where: { status: "resolved" } } },
    });

    if (readyCases.length === 0) {
      await db.qaTestRun.update({
        where: { id: runId },
        data: {
          status: "error",
          errorMessage: "No hay casos de prueba listos (aprobados y sin datos pendientes) para este módulo.",
          finishedAt: new Date(),
        },
      });
      return;
    }

    const runEvidenceDir = join(EVIDENCE_DIR, runId);
    const reportCases: QaReportCase[] = [];
    let hasError = false;
    let hasFailure = false;

    for (const testCase of readyCases) {
      const resolvedData = new Map<string, string>();
      for (const req of testCase.missingDataRequests) {
        const value = req.kind === "secret" ? (req.encryptedValue ? decryptSecret(req.encryptedValue) : undefined) : req.businessValue ?? undefined;
        if (value !== undefined) resolvedData.set(req.fieldKey, value);
      }

      const caseEvidenceDir = join(runEvidenceDir, testCase.code);
      const result = await executeQaCase({
        targetUrl: run.module.targetUrl,
        setupSteps,
        caseSteps: testCase.steps as unknown as QaStep[],
        resolvedData,
        evidenceDir: caseEvidenceDir,
      });

      if (result.status === "error") hasError = true;
      else if (result.status === "failed") hasFailure = true;

      await db.qaTestRunItem.create({
        data: {
          runId,
          testCaseId: testCase.id,
          status: result.status,
          errorMessage: result.errorMessage,
          screenshots: result.screenshots as unknown as object[],
          finishedAt: new Date(),
        },
      });

      // Registra en qué corrida se usó por primera vez cada dato ya resuelto
      // (trazabilidad, sección 5 del módulo) — solo la primera vez, nunca se sobreescribe.
      await db.qaMissingDataRequest.updateMany({
        where: { testCaseId: testCase.id, status: "resolved", firstUsedRunId: null },
        data: { firstUsedRunId: runId },
      });

      reportCases.push({
        code: testCase.code,
        title: testCase.title,
        expectedResult: testCase.expectedResult,
        status: result.status,
        errorMessage: result.errorMessage,
        steps: [...setupSteps, ...(testCase.steps as unknown as QaStep[])].map((s) => ({ description: s.description })),
        // Las capturas se guardan en runEvidenceDir/<código del caso>/NNN.png
        // (ver caseEvidenceDir arriba) — el reporte recibe rutas relativas a
        // runEvidenceDir, así que hay que anteponer el código del caso, o
        // buildQaReport busca el archivo en la carpeta equivocada.
        screenshotFiles: result.screenshots.map((f) => join(testCase.code, f)),
      });
    }

    const finalStatus = hasError ? "error" : hasFailure ? "failed" : "passed";
    const finishedAt = new Date();

    let reportFile: string | undefined;
    try {
      const buffer = await buildQaReport({
        moduleName: run.module.name,
        targetUrl: run.module.targetUrl,
        runId,
        startedAt: run.startedAt,
        finishedAt,
        status: finalStatus,
        cases: reportCases,
        evidenceDir: runEvidenceDir,
      });
      await mkdir(REPORT_DIR, { recursive: true });
      reportFile = `${runId}.pdf`;
      await writeFile(join(REPORT_DIR, reportFile), buffer);
    } catch (error) {
      this.logger.warn(`No se pudo generar el reporte PDF de la corrida ${runId}: ${error instanceof Error ? error.message : error}`);
    }

    await db.qaTestRun.update({
      where: { id: runId },
      data: { status: finalStatus, finishedAt, reportFile },
    });

    this.logger.log(`Corrida QA ${runId} terminó: ${finalStatus} (${readyCases.length} casos)`);
  }
}
