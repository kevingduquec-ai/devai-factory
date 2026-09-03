import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { QaMissingDataRequest, QaTestCase } from "@prisma/client";
import { TenantPrismaService } from "../prisma/tenant-prisma.service";
import { ClaudeClient } from "../orchestrator/claude-client";
import { runQaTestCasesStage, type QaTestCaseDraft } from "../orchestrator/stages/qa-test-cases.stage";
import { encryptSecret, decryptSecret } from "../common/crypto";
import { CreateQaModuleDto } from "./dto/create-qa-module.dto";
import { UpdateSetupStepsDto } from "./dto/update-setup-steps.dto";
import { ResolveMissingDataDto } from "./dto/resolve-missing-data.dto";
import { QA_RUN_QUEUE } from "./qa.constants";
import type { QaRunJobData } from "./qa-run.processor";
import { autoBuildLoginSetupSteps, runDiscovery } from "./playwright-discovery";
import type { QaStep } from "./qa-step.types";

function padCode(prefix: string, i: number) {
  return `${prefix}-${String(i + 1).padStart(3, "0")}`;
}

interface DiscoveredPageLike {
  headings?: string[];
  buttons?: { text: string }[];
  links?: { text: string }[];
  textSnippets?: string[];
}

/** Todo el texto real que el sistema efectivamente vio en el módulo — la única fuente válida para una aserción de texto. */
function collectKnownTexts(discoveredStructure: unknown): string[] {
  const pages = (discoveredStructure as { pages?: DiscoveredPageLike[] } | undefined)?.pages ?? [];
  const texts: string[] = [];
  for (const p of pages) {
    texts.push(...(p.headings ?? []));
    texts.push(...(p.buttons ?? []).map((b) => b.text));
    texts.push(...(p.links ?? []).map((l) => l.text));
    texts.push(...(p.textSnippets ?? []));
  }
  return texts;
}

function isTextGrounded(value: string, knownTexts: string[]): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return knownTexts.some((t) => {
    const known = t.trim().toLowerCase();
    return known === normalized || known.includes(normalized) || normalized.includes(known);
  });
}

/**
 * Red de seguridad mecánica contra el error más común de este pipeline: la
 * IA inventando cómo se ve un resultado exitoso (ej. "Mi carrito (1)")
 * aunque el prompt se lo prohíba explícitamente — un caso real ya
 * demostró que la instrucción sola no basta. En vez de confiar solo en
 * que el modelo obedezca, cada assert_text/wait_for_text con un valor
 * literal se verifica contra el mapa REAL que el sistema efectivamente
 * capturó; si ese texto exacto no aparece ahí, el paso se convierte en
 * una pregunta al cliente (mismo mecanismo que ya existe para
 * credenciales) en vez de dejar pasar una aserción que nunca se va a
 * cumplir en la corrida real.
 */
function groundOrAskInstead(draft: QaTestCaseDraft, knownTexts: string[]): QaTestCaseDraft {
  let counter = 0;
  const missingData = [...draft.missingData];
  const steps = draft.steps.map((step) => {
    const isTextAssertion = step.action === "assert_text" || step.action === "wait_for_text";
    if (!isTextAssertion || !step.value || step.dataRef) return step;
    if (isTextGrounded(step.value, knownTexts)) return step;

    counter += 1;
    const fieldKey = `texto_sin_confirmar_${counter}`;
    missingData.push({
      fieldKey,
      kind: "business",
      question: `El sistema no pudo confirmar en la página real qué texto exacto aparece para: "${step.description}". ¿Cuál es el texto exacto que debería verse en pantalla?`,
      format: "texto exacto tal como aparece en pantalla",
    });
    return { ...step, value: null, dataRef: fieldKey };
  });
  return { ...draft, steps, missingData };
}

function runJobId(runId: string) {
  return `qa-run-${runId}`;
}

@Injectable()
export class QaService {
  constructor(
    private readonly tenant: TenantPrismaService,
    private readonly claude: ClaudeClient,
    @InjectQueue(QA_RUN_QUEUE) private readonly runQueue: Queue<QaRunJobData>,
  ) {}

  /**
   * Add-on desactivado por defecto, igual que integrationsEnabled — el
   * super-admin lo activa persona por persona, nunca un beneficio
   * automático de ningún plan.
   */
  private async assertQaAutomationEnabled(userId: string) {
    const db = this.tenant.client;
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { qaAutomationEnabled: true } });
    if (!user.qaAutomationEnabled) {
      throw new ForbiddenException(
        "El módulo QA-AI de pruebas automatizadas no está activo en tu cuenta. Contacta al equipo de Qubit para activarlo.",
      );
    }
  }

  private async assertSubscriptionActive(orgId: string) {
    const db = this.tenant.client;
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { subscriptionActive: true } });
    if (!org.subscriptionActive) {
      throw new ForbiddenException("Tu organización todavía no tiene una suscripción activa.");
    }
  }

  /**
   * A diferencia del vault de Jira/ClickUp (tokens de un tercero que nunca
   * se vuelven a mostrar), esto es la propia cuenta de prueba del cliente
   * para SU módulo — tiene que poder verla y corregirla si se equivocó al
   * escribirla. Sigue cifrada en la base de datos (AES-256-GCM), pero se
   * descifra aquí para devolverla a quien ya tiene permiso de ver este
   * módulo. Solo cuando ya está resuelta — antes de eso no hay nada que
   * mostrar.
   */
  private sanitizeMissingData(req: QaMissingDataRequest) {
    const { encryptedValue, businessValue, ...rest } = req;
    let value: string | null = null;
    if (req.status === "resolved") {
      value = req.kind === "secret" ? (encryptedValue ? decryptSecret(encryptedValue) : null) : businessValue;
    }
    return { ...rest, value };
  }

  async listModules() {
    const { orgId, userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    return this.tenant.client.qaTestModule.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { testCases: true, testRuns: true } } },
    });
  }

  async createModule(dto: CreateQaModuleDto) {
    const { orgId, userId } = this.tenant.currentUser;
    await this.assertSubscriptionActive(orgId);
    await this.assertQaAutomationEnabled(userId);

    let setupSteps = dto.setupSteps;

    // Atajo "solo con la URL": si no armaron los pasos a mano pero dieron
    // correo+contraseña, se detecta el formulario de login solo. Si no se
    // encuentra, NUNCA se bloquea la creación (sección 5 del módulo: el
    // sistema debe avanzar, no detenerse en seco) — se sigue igual a la
    // Fase 1 de abajo con lo que haya, para que al generar casos la IA vea
    // algo real (puede incluir el propio formulario de login) y, si hace
    // falta autenticarse, lo pida como dato faltante en el caso en vez de
    // dejar al cliente sin ninguna forma de avanzar.
    if (setupSteps.length === 0 && dto.loginEmail && dto.loginPassword) {
      const result = await autoBuildLoginSetupSteps({
        targetUrl: dto.targetUrl,
        email: dto.loginEmail,
        password: dto.loginPassword,
      });
      if (result.steps) {
        setupSteps = result.steps as unknown as typeof setupSteps;
      }
    }

    const scopeMode = (dto.scopeMode as "scoped" | "full") ?? "scoped";

    // Fase 1 real, siempre — no solo cuando hay login: un módulo sin
    // credenciales (la app ya es pública, o no necesita sesión) merece el
    // mismo análisis real de la pantalla que el cliente describió, en vez
    // de quedarse sin ningún mapa hasta que alguien apriete "Detectar de
    // nuevo" a mano. `relevanceText` guía la exploración hacia la
    // funcionalidad descrita (ver runDiscovery) — sin esto, un módulo
    // "puntual" se queda en la primera pantalla alcanzada aunque lo pedido
    // viva en otra ruta, y los casos generados después no corresponden a
    // la plataforma real.
    const { pages } = await runDiscovery({
      targetUrl: dto.targetUrl,
      setupSteps: setupSteps as unknown as QaStep[],
      scopeMode,
      relevanceText: `${dto.name} ${dto.description}`,
    });

    return this.tenant.client.qaTestModule.create({
      data: {
        orgId,
        name: dto.name,
        targetUrl: dto.targetUrl,
        scopeMode,
        description: dto.description,
        setupSteps: setupSteps as unknown as object[],
        discoveredStructure: { pages } as unknown as object,
        createdBy: userId,
      },
    });
  }

  /**
   * Fase 1: recorre el módulo (o, en Modo A, un puñado de páginas más
   * alcanzables desde ahí) y guarda su mapa funcional real — se usa luego
   * al generar casos, para que los selectores sean reales en vez de
   * adivinados. Se refresca solo cuando el cliente lo pide explícitamente.
   */
  async discoverModule(id: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    const module = await this.loadModule(id);

    const { pages } = await runDiscovery({
      targetUrl: module.targetUrl,
      setupSteps: (module.setupSteps ?? []) as unknown as QaStep[],
      scopeMode: module.scopeMode,
      relevanceText: `${module.name} ${module.description}`,
    });

    return this.tenant.client.qaTestModule.update({
      where: { id },
      data: { discoveredStructure: { pages } as unknown as object },
    });
  }

  private async loadModule(id: string) {
    const module = await this.tenant.client.qaTestModule.findUnique({ where: { id } });
    if (!module) {
      throw new NotFoundException("Módulo QA no encontrado");
    }
    return module;
  }

  async getModule(id: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    const module = await this.loadModule(id);
    const [testCases, testRuns] = await Promise.all([
      this.tenant.client.qaTestCase.findMany({
        where: { moduleId: id },
        orderBy: { code: "asc" },
        include: { missingDataRequests: true },
      }),
      this.tenant.client.qaTestRun.findMany({
        where: { moduleId: id },
        orderBy: { startedAt: "desc" },
        take: 10,
        include: { items: { include: { testCase: { select: { code: true, title: true } } } } },
      }),
    ]);
    return {
      module,
      testCases: testCases.map((tc) => ({
        ...tc,
        missingDataRequests: tc.missingDataRequests.map((r) => this.sanitizeMissingData(r)),
      })),
      testRuns,
    };
  }

  async updateSetupSteps(id: string, dto: UpdateSetupStepsDto) {
    const { userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    await this.loadModule(id);
    return this.tenant.client.qaTestModule.update({
      where: { id },
      data: { setupSteps: dto.setupSteps as unknown as object[] },
    });
  }

  /**
   * Fase 1+2: le pide a Claude los casos de prueba del módulo (nunca
   * repite el acceso, que ya cubre setupSteps — Fase 0) y crea cada caso,
   * junto con sus QaMissingDataRequest si el modelo marcó algún dato como
   * desconocido. Un caso con datos pendientes nace bloqueado; el resto
   * nace en borrador, a la espera de aprobación humana (sección 7).
   */
  async generateCases(moduleId: string) {
    const { orgId, userId } = this.tenant.currentUser;
    await this.assertSubscriptionActive(orgId);
    await this.assertQaAutomationEnabled(userId);
    const module = await this.loadModule(moduleId);

    const setupSteps = Array.isArray(module.setupSteps) ? (module.setupSteps as unknown[]) : [];
    const result = await runQaTestCasesStage(this.claude, {
      moduleName: module.name,
      targetUrl: module.targetUrl,
      description: module.description,
      hasSetupSteps: setupSteps.length > 0,
      discoveredStructure: module.discoveredStructure ?? undefined,
    });

    const existingCount = await this.tenant.client.qaTestCase.count({ where: { moduleId } });
    const created: QaTestCase[] = [];
    const knownTexts = collectKnownTexts(module.discoveredStructure);
    const groundedDrafts = result.data.testCases.map((draft) => groundOrAskInstead(draft, knownTexts));

    await this.tenant.client.$transaction(async (tx) => {
      for (const [i, draft] of groundedDrafts.entries()) {
        const hasMissingData = draft.missingData.length > 0;
        const testCase = await tx.qaTestCase.create({
          data: {
            orgId,
            moduleId,
            code: padCode("CP-QA", existingCount + i),
            title: draft.title,
            severity: draft.severity,
            steps: draft.steps as unknown as object[],
            expectedResult: draft.expectedResult,
            status: hasMissingData ? "blocked_missing_data" : "draft",
          },
        });
        created.push(testCase);
        for (const md of draft.missingData) {
          await tx.qaMissingDataRequest.create({
            data: {
              orgId,
              testCaseId: testCase.id,
              kind: md.kind,
              fieldKey: md.fieldKey,
              question: md.question,
              format: md.format,
            },
          });
        }
      }
    });

    return created;
  }

  async approveCase(caseId: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    const testCase = await this.tenant.client.qaTestCase.findUnique({ where: { id: caseId } });
    if (!testCase) {
      throw new NotFoundException("Caso de prueba no encontrado");
    }
    if (testCase.status === "blocked_missing_data") {
      throw new BadRequestException("Este caso todavía tiene datos pendientes de resolver — no se puede aprobar.");
    }
    return this.tenant.client.qaTestCase.update({ where: { id: caseId }, data: { status: "ready" } });
  }

  async listMissingData() {
    const { orgId, userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    const requests = await this.tenant.client.qaMissingDataRequest.findMany({
      where: { orgId, status: "pending" },
      orderBy: { requestedAt: "asc" },
      include: { testCase: { select: { code: true, title: true, moduleId: true } } },
    });
    return requests.map((r) => this.sanitizeMissingData(r));
  }

  /**
   * Resuelve (o edita, si ya estaba resuelta) una solicitud de dato
   * faltante (sección 5): cifra si es secreto, guarda tal cual si es de
   * negocio, y — si con esto el caso ya no tiene ninguna solicitud
   * pendiente — lo regresa a "draft" (listo para que un humano lo
   * apruebe), nunca directo a "ready" sin ese paso. Editar un valor ya
   * resuelto no reabre nada por sí solo (el caso ya pasó ese punto), pero
   * si se corrige un dato mal escrito, la próxima corrida usa el valor
   * nuevo — respondedAt/respondedBy se actualizan para reflejar la
   * corrección más reciente.
   */
  async resolveMissingData(requestId: string, dto: ResolveMissingDataDto) {
    const { userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    const request = await this.tenant.client.qaMissingDataRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException("Solicitud de dato no encontrada");
    }

    const updated = await this.tenant.client.qaMissingDataRequest.update({
      where: { id: requestId },
      data: {
        status: "resolved",
        respondedAt: new Date(),
        respondedBy: userId,
        encryptedValue: request.kind === "secret" ? encryptSecret(dto.value) : null,
        businessValue: request.kind === "business" ? dto.value : null,
      },
    });

    const remainingPending = await this.tenant.client.qaMissingDataRequest.count({
      where: { testCaseId: request.testCaseId, status: "pending" },
    });
    if (remainingPending === 0) {
      await this.tenant.client.qaTestCase.updateMany({
        where: { id: request.testCaseId, status: "blocked_missing_data" },
        data: { status: "draft" },
      });
    }

    return this.sanitizeMissingData(updated);
  }

  async triggerRun(moduleId: string) {
    const { orgId, userId } = this.tenant.currentUser;
    await this.assertSubscriptionActive(orgId);
    await this.assertQaAutomationEnabled(userId);
    await this.loadModule(moduleId);

    const readyCount = await this.tenant.client.qaTestCase.count({ where: { moduleId, status: "ready" } });
    if (readyCount === 0) {
      throw new BadRequestException("No hay casos de prueba aprobados (listos) para ejecutar en este módulo.");
    }

    const run = await this.tenant.client.qaTestRun.create({
      data: { orgId, moduleId, status: "in_progress", triggeredBy: userId },
    });

    await this.runQueue.add(
      "run-qa-module",
      { runId: run.id, orgId },
      { jobId: runJobId(run.id), removeOnComplete: true, removeOnFail: 50 },
    );

    return run;
  }

  async listRuns(moduleId: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    return this.tenant.client.qaTestRun.findMany({
      where: { moduleId },
      orderBy: { startedAt: "desc" },
      include: { items: { include: { testCase: { select: { code: true, title: true } } } } },
    });
  }

  async getRun(id: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    const run = await this.tenant.client.qaTestRun.findUnique({
      where: { id },
      include: { items: { include: { testCase: { select: { code: true, title: true } } } } },
    });
    if (!run) {
      throw new NotFoundException("Corrida no encontrada");
    }
    return run;
  }

  async getReportFile(runId: string) {
    const { userId } = this.tenant.currentUser;
    await this.assertQaAutomationEnabled(userId);
    const run = await this.tenant.client.qaTestRun.findUnique({ where: { id: runId } });
    if (!run || !run.reportFile) {
      throw new NotFoundException("Todavía no hay un reporte generado para esta corrida");
    }
    return run.reportFile;
  }
}
