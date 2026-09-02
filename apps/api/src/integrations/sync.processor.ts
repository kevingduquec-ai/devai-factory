import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { decryptSecret } from "../common/crypto";
import { getProviderAdapter, ProviderAuthError } from "./providers";
import type { ProviderCredentials, CreatedIssueRef } from "./providers/provider.types";
import { buildCanonicalPayload } from "./canonical-mapper";
import { SYNC_QUEUE } from "./integrations.constants";

export interface SyncJobData {
  syncRunId: string;
  orgId: string;
}

// Espaciado entre llamadas para no gatillar el límite de tasa de entrada —
// los reintentos con backoff en http-retry.ts cubren el resto (sección 5.5).
const CALL_SPACING_MS = 350;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Processor(SYNC_QUEUE)
export class SyncProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    const { syncRunId, orgId } = job.data;
    const db = this.prisma.forOrg(orgId);

    const syncRun = await db.syncRun.findUniqueOrThrow({
      where: { id: syncRunId },
      include: { connection: true, project: true },
    });
    const { connection, project } = syncRun;

    const creds: ProviderCredentials = {
      siteUrl: connection.siteUrl,
      authEmail: connection.authEmail,
      apiToken: decryptSecret(connection.encryptedToken),
    };
    const adapter = getProviderAdapter(connection.provider);
    const mapping = (connection.mapping ?? { notes: [] }) as unknown as import("./providers/provider.types").SuggestedMapping;

    // Se prueba la conexión ANTES de crear nada — así un token revocado
    // nunca deja un envío a medias sin avisar (sección 8: "nunca falla en
    // silencio"). Si falla, se marca el envío completo como fallido y la
    // conexión como expirada, sin intentar ningún ítem.
    try {
      await adapter.testConnection(creds);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de conexión desconocido";
      await db.$transaction([
        db.integrationConnection.update({
          where: { id: connection.id },
          data: error instanceof ProviderAuthError ? { status: "expired" } : {},
        }),
        db.syncRun.update({
          where: { id: syncRunId },
          data: { status: "failed", finishedAt: new Date(), errorMessage: message },
        }),
      ]);
      this.logger.warn(`Envío ${syncRunId} abortado antes de empezar: ${message}`);
      return;
    }

    const [requirements, stories, testCases] = await Promise.all([
      db.requirement.findMany({ where: { projectId: project.id }, orderBy: { code: "asc" } }),
      db.userStory.findMany({
        where: { projectId: project.id },
        include: { acceptanceCriteria: true },
        orderBy: { code: "asc" },
      }),
      db.testCase.findMany({
        where: { projectId: project.id },
        include: { acceptanceCriterion: true },
        orderBy: { code: "asc" },
      }),
    ]);
    const canonical = buildCanonicalPayload(requirements, stories, testCases as never);

    const epicRefs = new Map<string, CreatedIssueRef>();
    const storyRefs = new Map<string, CreatedIssueRef>();
    let successCount = 0;
    let failureCount = 0;

    for (const epic of canonical.epics) {
      await sleep(CALL_SPACING_MS);
      try {
        const ref = await adapter.createEpic(creds, connection.targetId!, mapping, epic);
        epicRefs.set(epic.internalId, ref);
        successCount += 1;
        await db.syncItem.create({
          data: {
            syncRunId,
            itemType: "epic",
            internalCode: epic.code,
            internalTitle: epic.title,
            externalId: ref.externalId,
            externalUrl: ref.externalUrl,
            status: "created",
          },
        });
      } catch (error) {
        failureCount += 1;
        await db.syncItem.create({
          data: {
            syncRunId,
            itemType: "epic",
            internalCode: epic.code,
            internalTitle: epic.title,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Error desconocido",
          },
        });
      }
    }

    for (const story of canonical.stories) {
      const epicRef = epicRefs.get(story.epicInternalId);
      if (!epicRef) {
        failureCount += 1;
        await db.syncItem.create({
          data: {
            syncRunId,
            itemType: "user_story",
            internalCode: story.code,
            internalTitle: story.title,
            status: "failed",
            errorMessage: "Su épica padre no se pudo crear, así que esta historia se omitió",
          },
        });
        continue;
      }
      await sleep(CALL_SPACING_MS);
      try {
        const ref = await adapter.createStory(creds, connection.targetId!, mapping, story, epicRef.externalId);
        storyRefs.set(story.internalId, ref);
        successCount += 1;
        await db.syncItem.create({
          data: {
            syncRunId,
            itemType: "user_story",
            internalCode: story.code,
            internalTitle: story.title,
            externalId: ref.externalId,
            externalUrl: ref.externalUrl,
            status: "created",
          },
        });
      } catch (error) {
        failureCount += 1;
        await db.syncItem.create({
          data: {
            syncRunId,
            itemType: "user_story",
            internalCode: story.code,
            internalTitle: story.title,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Error desconocido",
          },
        });
      }
    }

    for (const testCase of canonical.testCases) {
      const storyRef = storyRefs.get(testCase.storyInternalId);
      if (!storyRef) {
        failureCount += 1;
        await db.syncItem.create({
          data: {
            syncRunId,
            itemType: "test_case",
            internalCode: testCase.code,
            internalTitle: testCase.title,
            status: "failed",
            errorMessage: "Su historia padre no se pudo crear, así que este caso de prueba se omitió",
          },
        });
        continue;
      }
      await sleep(CALL_SPACING_MS);
      try {
        const ref = await adapter.createTestCase(creds, connection.targetId!, mapping, testCase, storyRef.externalId);
        successCount += 1;
        await db.syncItem.create({
          data: {
            syncRunId,
            itemType: "test_case",
            internalCode: testCase.code,
            internalTitle: testCase.title,
            externalId: ref.externalId,
            externalUrl: ref.externalUrl,
            status: "created",
          },
        });
      } catch (error) {
        failureCount += 1;
        await db.syncItem.create({
          data: {
            syncRunId,
            itemType: "test_case",
            internalCode: testCase.code,
            internalTitle: testCase.title,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "Error desconocido",
          },
        });
      }
    }

    const finalStatus = failureCount === 0 ? "completed" : successCount === 0 ? "failed" : "completed_with_errors";
    await db.syncRun.update({ where: { id: syncRunId }, data: { status: finalStatus, finishedAt: new Date() } });
    this.logger.log(`Envío ${syncRunId} terminó: ${successCount} creados, ${failureCount} fallidos (${finalStatus})`);
  }
}
