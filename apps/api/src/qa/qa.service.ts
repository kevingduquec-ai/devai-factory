import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
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
import { autoBuildLoginSetupSteps, runDiscovery, investigateLoginFlow, type LoginInvestigationResult } from "./playwright-discovery";
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

const EMPTY_OR_INVALID_EMAIL_TITLE_PATTERN = /(correo|email|usuario)[^.]*(vac[íi]|inv[áa]lid)|(vac[íi]|inv[áa]lid)[^.]*(correo|email|usuario)/i;

/**
 * Red de seguridad mecánica para el mismo patrón de la regla 10: un caso
 * que prueba "correo vacío/inválido no permite avanzar" incluye de todos
 * modos un fill sobre el campo de contraseña — que en un login de varios
 * pasos (regla 6b) no puede existir todavía si el correo nunca fue válido,
 * así que ese fill siempre revienta con un timeout que no prueba nada real
 * de la aplicación. Caso real que ya pasó: un caso de "correo vacío"
 * llenaba la contraseña sin haber llenado el correo, y otro de "formato de
 * correo inválido" llenaba un correo malformado y LUEGO la contraseña —
 * ambos fallan por diseño del caso, no por un bug del sitio. Se detecta
 * por tres señales independientes (cualquiera basta): el título del caso
 * ya delata que el correo es el campo bajo prueba (vacío o inválido); no
 * hay ningún fill de correo antes del fill de contraseña (se intenta
 * llenar una contraseña sin haber tocado el correo primero); o el valor
 * literal usado para el correo no tiene forma de correo real (sin "@") y
 * no viene de un dataRef (cuenta real pedida al cliente). En cualquiera
 * de los tres casos se elimina el fill de contraseña — el resto del caso
 * (el click de envío y la aserción final, que ya suelen verificar
 * correctamente que el campo de correo sigue visible) queda intacto.
 */
function fixPrematurePasswordFill(draft: QaTestCaseDraft): QaTestCaseDraft {
  const passwordFillIndex = draft.steps.findIndex(
    (s) => s.action === "fill" && /password|contrase/i.test(s.selector ?? ""),
  );
  if (passwordFillIndex === -1) return draft;

  const precedingEmailFill = draft.steps
    .slice(0, passwordFillIndex)
    .reverse()
    .find((s) => s.action === "fill" && !/password|contrase/i.test(s.selector ?? ""));

  const titleSignalsInvalidEmail = EMPTY_OR_INVALID_EMAIL_TITLE_PATTERN.test(draft.title);
  const noEmailFillBeforePassword = !precedingEmailFill;
  const emailValueLooksMalformed =
    !!precedingEmailFill && !precedingEmailFill.dataRef && !(precedingEmailFill.value ?? "").includes("@");

  if (!titleSignalsInvalidEmail && !noEmailFillBeforePassword && !emailValueLooksMalformed) return draft;

  const steps = draft.steps.filter((_, i) => i !== passwordFillIndex);
  return { ...draft, steps };
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
  private readonly logger = new Logger(QaService.name);

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

    // El login investigado en vivo (confirmedLoginFlow, ver
    // runLoginInvestigationIfReady) no depende de este re-escaneo
    // estructural — perderlo cada vez que el cliente pide "Detectar de
    // nuevo" haría que la generación de casos volviera a adivinar sin
    // motivo.
    const existingStructure = (module.discoveredStructure ?? {}) as { confirmedLoginFlow?: unknown };
    return this.tenant.client.qaTestModule.update({
      where: { id },
      data: { discoveredStructure: { pages, confirmedLoginFlow: existingStructure.confirmedLoginFlow } as unknown as object },
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
      result.data.testCases
        .map((draft) => groundOrAskInstead(draft, knownTexts))
        .map(fixUnconfirmedUrlAssertion)
        .map(fixPrematurePasswordFill),
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
    const request = await this.tenant.client.qaMissingDataRequest.findUnique({
      where: { id: requestId },
      include: { testCase: { select: { moduleId: true } } },
    });
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

    // Justo cuando el correo/contraseña real del login queda resuelto (en
    // cualquier caso del módulo, no solo este) es el único momento en que
    // el sistema puede dejar de adivinar el login y de verdad investigarlo
    // en vivo — ver investigateLoginFlow(). Se espera aquí (no en segundo
    // plano) para que el cliente vea los casos ya corregidos apenas
    // responde, a costa de que este POST puntual tarde más de lo normal
    // (una sola vez por módulo). Nunca debe romper el guardado del dato en
    // sí si la investigación falla por lo que sea.
    if (request.kind === "secret" && (request.fieldKey === "login_email" || request.fieldKey === "login_password")) {
      await this.runLoginInvestigationIfReady(request.testCase.moduleId).catch((e) => {
        this.logger.warn(`Investigación de login falló para el módulo ${request.testCase.moduleId}: ${e instanceof Error ? e.message : String(e)}`);
      });
    }

    return this.sanitizeMissingData(updated);
  }

  /**
   * Dispara investigateLoginFlow() apenas el módulo tenga AMBAS
   * credenciales reales resueltas (en cualquiera de sus casos) y todavía
   * no se haya investigado — es idempotente: si discoveredStructure ya
   * trae confirmedLoginFlow, no vuelve a correr. Guarda el resultado en el
   * módulo y reescribe los casos existentes con refineCasesWithConfirmedLogin().
   */
  private async runLoginInvestigationIfReady(moduleId: string): Promise<void> {
    const module = await this.tenant.client.qaTestModule.findUnique({ where: { id: moduleId } });
    if (!module) return;
    const existingStructure = (module.discoveredStructure ?? {}) as { confirmedLoginFlow?: unknown };
    if (existingStructure.confirmedLoginFlow) return;

    const resolvedSecrets = await this.tenant.client.qaMissingDataRequest.findMany({
      where: {
        testCase: { moduleId },
        kind: "secret",
        status: "resolved",
        fieldKey: { in: ["login_email", "login_password"] },
      },
    });
    const emailReq = resolvedSecrets.find((r) => r.fieldKey === "login_email");
    const passwordReq = resolvedSecrets.find((r) => r.fieldKey === "login_password");
    if (!emailReq?.encryptedValue || !passwordReq?.encryptedValue) return;

    const email = decryptSecret(emailReq.encryptedValue);
    const password = decryptSecret(passwordReq.encryptedValue);

    const confirmed = await investigateLoginFlow({ targetUrl: module.targetUrl, email, password });
    if (!confirmed) return;

    await this.tenant.client.qaTestModule.update({
      where: { id: moduleId },
      data: { discoveredStructure: { ...existingStructure, confirmedLoginFlow: confirmed } as unknown as object },
    });

    await this.refineCasesWithConfirmedLogin(moduleId, confirmed);
  }

  /**
   * Reescribe los pasos de TODOS los casos existentes del módulo con los
   * selectores que investigateLoginFlow() acaba de confirmar en vivo —
   * reemplaza cada selector "inferido, no confirmado en el mapa" por el
   * real, e inserta el click de "Siguiente" que un login en dos pasos
   * necesita si el caso no lo tenía. También resuelve automáticamente
   * cualquier pregunta de missingData que siga PENDIENTE sobre el texto de
   * éxito o error del login, usando el texto que la investigación observó
   * de verdad — así un humano deja de tener que adivinar (o traducir) ese
   * texto, la causa exacta de un bug real de esta sesión (se pidió el
   * texto en español y la pantalla real lo mostraba en inglés). Nunca
   * toca una respuesta que el cliente ya dio — solo completa lo pendiente.
   */
  private async refineCasesWithConfirmedLogin(moduleId: string, confirmed: LoginInvestigationResult): Promise<void> {
    const cases = await this.tenant.client.qaTestCase.findMany({
      where: { moduleId },
      include: { missingDataRequests: true },
    });

    const isEmailFill = (s: QaStep) =>
      s.action === "fill" && (s.dataRef === "login_email" || (/email|text/i.test(s.selector ?? "") && !/password|contrase/i.test(s.selector ?? "")));
    const isPasswordFill = (s: QaStep) => s.action === "fill" && (s.dataRef === "login_password" || /password|contrase/i.test(s.selector ?? ""));
    const isLoginClick = (s: QaStep, i: number) => s.action === "click" && i === 0 && /iniciar sesi[oó]n|log\s?in|sign\s?in|entrar|acceder|ingresar|mi cuenta|my account|acceso/i.test(s.selector ?? "");

    for (const testCase of cases) {
      const steps = testCase.steps as unknown as QaStep[];
      const hasPasswordFill = steps.some(isPasswordFill);
      let changed = false;
      const newSteps: QaStep[] = [];

      for (const [i, step] of steps.entries()) {
        if (isLoginClick(step, i) && confirmed.loginClickSelector) {
          newSteps.push({ ...step, selector: confirmed.loginClickSelector, description: "Hacer click en el botón de acceso (confirmado por investigación real con las credenciales del cliente)." });
          changed = true;
          continue;
        }
        if (isEmailFill(step)) {
          newSteps.push({ ...step, selector: confirmed.emailSelector, description: step.description.replace(/\(selector inferido[^)]*\)/i, "(selector confirmado por investigación real)") });
          changed = true;
          // El caso original ya puede traer su propio click justo después
          // (ej. el intento de envío de un caso de "correo vacío") — solo
          // insertamos el click de avance si ese paso no existe, para no
          // terminar con dos clicks seguidos sobre el mismo botón.
          const nextOriginalStep = steps[i + 1];
          if (confirmed.isTwoStep && confirmed.nextSelector && nextOriginalStep?.action !== "click") {
            newSteps.push({
              action: "click",
              selector: confirmed.nextSelector,
              value: null,
              dataRef: null,
              description: "Hacer click en el botón para avanzar a la pantalla de contraseña (confirmado por investigación real).",
            });
          }
          continue;
        }
        if (isPasswordFill(step)) {
          newSteps.push({ ...step, selector: confirmed.passwordSelector, description: step.description.replace(/\(selector inferido[^)]*\)/i, "(selector confirmado por investigación real)") });
          changed = true;
          continue;
        }
        // El click de envío genérico: si el caso llena contraseña, es el
        // submit real de la última pantalla; si no (casos de "correo
        // vacío", que nunca llegan a la contraseña), es el botón de avanzar
        // de la PRIMERA pantalla — dos selectores distintos en un login de
        // dos pasos, y confundirlos fue exactamente el bug que rompía
        // estos casos antes de tener esta investigación.
        if (step.action === "click" && /submit|enviar|envío/i.test(`${step.selector ?? ""} ${step.description}`)) {
          const target = hasPasswordFill ? confirmed.submitSelector : (confirmed.nextSelector ?? confirmed.submitSelector);
          newSteps.push({ ...step, selector: target, description: step.description.replace(/\(selector inferido[^)]*\)/i, "(selector confirmado por investigación real)") });
          changed = true;
          continue;
        }
        newSteps.push(step);
      }

      if (changed) {
        await this.tenant.client.qaTestCase.update({ where: { id: testCase.id }, data: { steps: newSteps as unknown as object[] } });
      }

      // Autocompleta preguntas PENDIENTES sobre el resultado del login con
      // lo que la investigación observó de verdad — nunca sobrescribe una
      // respuesta que el cliente ya dio. A propósito solo en los casos de
      // alta confianza: un caso real ya demostró que el textSnippet[0] de
      // la pantalla de "contraseña incorrecta" puede ser ruido (el propio
      // correo repetido en pantalla, no el mensaje de error) — un heading
      // real es mucho más confiable que cualquier textSnippet suelto, así
      // que si no hay un heading real, se deja la pregunta pendiente para
      // que la responda el cliente en vez de arriesgar un dato incorrecto.
      for (const md of testCase.missingDataRequests) {
        if (md.status !== "pending" || md.kind !== "business") continue;
        let candidate: string | undefined;
        if (/url/i.test(md.fieldKey) && confirmed.happyPath?.finalUrl) {
          candidate = confirmed.happyPath.finalUrl;
        } else if (/exito|éxito|success|bienvenid|welcome/i.test(md.fieldKey) && confirmed.happyPath?.headings[0]) {
          candidate = confirmed.happyPath.headings[0];
        } else if (/invalid|error|credencial/i.test(md.fieldKey) && confirmed.wrongPassword?.headings[0]) {
          candidate = confirmed.wrongPassword.headings[0];
        }
        if (!candidate) continue;
        await this.tenant.client.qaMissingDataRequest.update({
          where: { id: md.id },
          data: {
            status: "resolved",
            businessValue: candidate,
            respondedAt: new Date(),
            respondedBy: "investigacion-automatica",
          },
        });
      }

      const remainingPending = await this.tenant.client.qaMissingDataRequest.count({
        where: { testCaseId: testCase.id, status: "pending" },
      });
      if (remainingPending === 0) {
        await this.tenant.client.qaTestCase.updateMany({
          where: { id: testCase.id, status: "blocked_missing_data" },
          data: { status: "draft" },
        });
      }
    }
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
