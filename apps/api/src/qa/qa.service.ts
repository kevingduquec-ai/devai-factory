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

const UNCONFIRMED_ACCESS_MARKER = "inferido, no confirmado en el mapa";

/**
 * Red de seguridad mecánica para el mismo patrón que ya causó un fallo
 * real: un caso cuyo primer click de acceso está marcado por el propio
 * modelo como "inferido, no confirmado en el mapa" (login detrás de un
 * botón — regla 6b del prompt, típico de logins federados tipo Microsoft)
 * puede terminar navegando a un dominio externo. El prompt ya instruye
 * (regla 11) a NUNCA cerrar ese caso con un assert_url del sitio original
 * en vez de assert_element_visible — pero un modelo no sigue una
 * instrucción de texto el 100% de las veces (ver memoria del proyecto), y
 * exactamente esa combinación ya produjo un caso que fallaba por una
 * suposición equivocada sobre el dominio, no por un bug real de la
 * aplicación. Este backstop lo corrige determinísticamente: si el caso
 * empieza con ese click no confirmado y termina en un assert_url, lo
 * reescribe a assert_element_visible sobre el último campo que el propio
 * caso llenó — la aserción que sigue siendo válida sin importar a qué
 * dominio terminó el click.
 */
function fixUnconfirmedUrlAssertion(draft: QaTestCaseDraft): QaTestCaseDraft {
  const steps = draft.steps;
  const hasUnconfirmedAccessClick = steps.some(
    (s) => s.action === "click" && (s.description ?? "").includes(UNCONFIRMED_ACCESS_MARKER),
  );
  if (!hasUnconfirmedAccessClick) return draft;

  const lastIndex = steps.length - 1;
  const lastStep = steps[lastIndex];
  if (!lastStep || lastStep.action !== "assert_url") return draft;

  const lastFillStep = [...steps].reverse().find((s) => s.action === "fill" && s.selector);
  if (!lastFillStep?.selector) return draft;

  const newSteps = steps.map((s, i) => {
    if (i !== lastIndex) return s;
    return {
      ...s,
      action: "assert_element_visible" as const,
      selector: lastFillStep.selector,
      value: null,
      description: `${s.description} (ajustado: el click de acceso no confirmó a qué dominio navega, así que se verifica que el campo sigue visible en vez de asumir la URL)`,
    };
  });
  return { ...draft, steps: newSteps };
}

/**
 * Red de seguridad mecánica para otro patrón que ya causó un fallo real:
 * un caso usa un dataRef (ej. "login_email") en sus steps pero no lo
 * declara en su PROPIO missingData, asumiendo — incorrectamente — que
 * basta con que otro caso de la misma tanda ya lo haya pedido. En runtime
 * cada caso resuelve sus datos de forma completamente independiente (ver
 * qa-run.processor.ts), así que ese caso revienta con "falta el dato" en
 * cuanto se ejecuta, aunque el cliente ya haya respondido la pregunta en
 * el caso hermano. El prompt ya lo prohíbe explícitamente, pero no se
 * cumple siempre — este backstop lo corrige completando, en cada caso que
 * le falte, el mismo item de missingData que otro caso de la tanda ya
 * definió para ese fieldKey (mismo texto de pregunta, así el cliente
 * reconoce que es el mismo dato). Si ningún caso de la tanda lo definió
 * en absoluto, genera una pregunta genérica en vez de dejar el caso roto.
 */
function fixOrphanedDataRefs(drafts: QaTestCaseDraft[]): QaTestCaseDraft[] {
  const definitionByKey = new Map<string, QaTestCaseDraft["missingData"][number]>();
  for (const draft of drafts) {
    for (const item of draft.missingData) {
      if (!definitionByKey.has(item.fieldKey)) definitionByKey.set(item.fieldKey, item);
    }
  }

  return drafts.map((draft) => {
    const declaredKeys = new Set(draft.missingData.map((m) => m.fieldKey));
    const usedKeys = new Set(draft.steps.map((s) => s.dataRef).filter((k): k is string => Boolean(k)));
    const orphanedKeys = [...usedKeys].filter((k) => !declaredKeys.has(k));
    if (orphanedKeys.length === 0) return draft;

    const backfilled = orphanedKeys.map((key) => {
      const borrowed = definitionByKey.get(key);
      if (borrowed) return borrowed;
      const looksSecret = /password|contrase|secret|clave/i.test(key);
      return {
        fieldKey: key,
        kind: (looksSecret ? "secret" : "business") as "secret" | "business",
        question: `Falta un dato para completar este caso de prueba (clave interna: "${key}"). ¿Cuál es el valor correcto?`,
        format: "texto libre",
      };
    });
    return { ...draft, missingData: [...draft.missingData, ...backfilled] };
  });
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
    const existingCases = await this.tenant.client.qaTestCase.findMany({
      where: { moduleId },
      select: { title: true },
    });
    const result = await runQaTestCasesStage(this.claude, {
      moduleName: module.name,
      targetUrl: module.targetUrl,
      description: module.description,
      hasSetupSteps: setupSteps.length > 0,
      discoveredStructure: module.discoveredStructure ?? undefined,
      existingCaseTitles: existingCases.map((c) => c.title),
    });

    const existingCount = existingCases.length;
    const created: QaTestCase[] = [];
    const knownTexts = collectKnownTexts(module.discoveredStructure);
    const groundedDrafts = fixOrphanedDataRefs(
      result.data.testCases.map((draft) => groundOrAskInstead(draft, knownTexts)).map(fixUnconfirmedUrlAssertion),
    );

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
