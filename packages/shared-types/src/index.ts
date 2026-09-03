// Plain const objects, not TypeScript `enum` — this package has no build
// step and is imported both by Next.js (its own TS transform handles enums
// fine) and directly by the NestJS backend at runtime via pnpm workspace
// linking. Node's native TypeScript type-stripping (used when the backend
// `require()`s this package's raw .ts source) only supports *erasable*
// syntax — real `enum` has runtime codegen and fails with
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. Const object + derived union type is
// erasable and behaves the same for consumers.
export const OrgRole = {
  OWNER: "owner",
  ADMIN: "admin",
  MEMBER: "member",
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const SubscriptionPlan = {
  STARTER: "starter",
  TEAM: "team",
  EMPRESA: "empresa",
} as const;
export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan];

export const PLAN_LABEL_ES: Record<SubscriptionPlan, string> = {
  starter: "Starter",
  team: "Team",
  empresa: "Empresa",
};

/**
 * Precio de referencia en COP/mes, solo para mostrar en la UI — el precio
 * real vive en Stripe. Recalculado cuando Starter pasó a ser solo el módulo
 * "Historia de usuario" (antes incluía el análisis completo): el costo real
 * de IA por historia es de centavos de dólar (Sonnet 5, ~$0.04 USD por
 * historia, medido en generaciones reales), así que 249.000 COP/mes había
 * quedado muy por encima de lo que el plan entrega. Se bajó a 149.000 y se
 * subieron los cupos (ver PLAN_LIMITS) — sigue dejando más de 90% de margen
 * bruto de IA incluso agotando el cupo, pero es una entrada mucho más
 * atractiva que empuja a quien necesita el paquete completo a subir a Team.
 * Team se dejó igual: con ambos módulos habilitados, el peor caso (70
 * generaciones, todas de paquete completo a ~$0.44 c/u) todavía deja ~79%
 * de margen bruto de IA.
 */
export const PLAN_PRICE_COP: Record<SubscriptionPlan, number | null> = {
  starter: 149_000,
  team: 849_000,
  empresa: null, // venta asistida, sin precio de autoservicio
};

export interface PlanLimits {
  /** Proyectos nuevos que se pueden crear por mes calendario. null = ilimitado. */
  maxProjectsPerMonth: number | null;
  /**
   * Total de ejecuciones del pipeline de IA por mes calendario — cuenta la
   * generación inicial y cada "Regenerar paquete completo" de cualquier
   * proyecto, ya que cada una consume tokens reales sin importar si el
   * proyecto ya contaba para maxProjectsPerMonth. null = ilimitado.
   */
  maxGenerationsPerMonth: number | null;
  /** Usuarios (activos + invitados) permitidos en la organización. null = ilimitado. */
  maxUsers: number | null;
  /** Si el plan se contrata por autoservicio (checkout de Stripe) o solo por venta asistida. */
  selfService: boolean;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  starter: { maxProjectsPerMonth: 25, maxGenerationsPerMonth: 40, maxUsers: 1, selfService: true },
  team: { maxProjectsPerMonth: 35, maxGenerationsPerMonth: 70, maxUsers: 10, selfService: true },
  empresa: { maxProjectsPerMonth: null, maxGenerationsPerMonth: null, maxUsers: null, selfService: false },
};

/**
 * El módulo "Análisis completo" (requerimientos + historias + modelo de
 * datos + API + casos de prueba) es un beneficio de los planes Team y
 * Empresa. Starter queda limitado al módulo "Historia de usuario", que está
 * disponible en los tres planes. Fuente única de verdad, usada tanto por el
 * backend (para rechazar la creación/generación) como por el frontend (para
 * mostrar el upsell en vez de dejar fallar la petición).
 */
export const PLANS_WITH_FULL_ANALYSIS: SubscriptionPlan[] = ["team", "empresa"];

export function planIncludesFullAnalysis(plan: SubscriptionPlan): boolean {
  return PLANS_WITH_FULL_ANALYSIS.includes(plan);
}

export interface UsageStatusDto {
  plan: SubscriptionPlan;
  projectsThisMonth: number;
  maxProjectsPerMonth: number | null;
  generationsThisMonth: number;
  maxGenerationsPerMonth: number | null;
  users: number;
  maxUsers: number | null;
  periodStart: string;
}

export interface AuthUserDto {
  id: string;
  email: string;
  name: string;
  role: OrgRole;
  orgId: string;
}

export interface OrgUserDto {
  id: string;
  email: string;
  name: string;
  role: OrgRole;
  status: "invited" | "active";
  /** Módulo "Historia de usuario" — habilitado por defecto, el super-admin lo desactiva persona por persona. */
  singleStoryEnabled: boolean;
  /** Add-on "Creación automática en Jira/ClickUp" — desactivado por defecto, el super-admin lo activa persona por persona. */
  integrationsEnabled: boolean;
  /** Add-on "QA-AI: automatización de pruebas web" — mismo patrón: desactivado por defecto, activación persona por persona. */
  qaAutomationEnabled: boolean;
  createdAt: string;
}

export interface OrganizationDto {
  id: string;
  name: string;
  plan: SubscriptionPlan;
  billingCustomerId: string | null;
  /** Falso hasta que Stripe confirme un pago o el super-admin la active a mano — mientras esté en false, la organización queda confinada a Facturación. */
  subscriptionActive: boolean;
  createdAt: string;
}

export interface AdminOrgUserDto {
  id: string;
  email: string;
  name: string;
  role: OrgRole;
  singleStoryEnabled: boolean;
  integrationsEnabled: boolean;
  qaAutomationEnabled: boolean;
}

export interface AdminOrganizationDto {
  id: string;
  name: string;
  plan: SubscriptionPlan;
  /** Cuando es true, ningún usuario de esta organización puede iniciar ni mantener sesión. */
  suspended: boolean;
  /** Falso = confinada a Facturación, no puede crear ni generar proyectos. */
  subscriptionActive: boolean;
  billingCustomerId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  userCount: number;
  projectCount: number;
  users: AdminOrgUserDto[];
  createdAt: string;
}

export interface AdminAuthDto {
  id: string;
  email: string;
  name: string;
}

export interface AuthTokensDto {
  accessToken: string;
  refreshToken: string;
}

export interface RegisterRequestDto {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface InviteUserRequestDto {
  email: string;
  role?: typeof OrgRole.ADMIN | typeof OrgRole.MEMBER;
}

export type ProjectStatus = "intake" | "ready_to_generate" | "generating" | "generated" | "failed";

export interface ProjectDto {
  id: string;
  orgId: string;
  name: string;
  domain: string | null;
  status: ProjectStatus;
  /** true = creado desde el módulo "Historia de usuario", false = "Análisis completo". Fijo de por vida. */
  storiesOnly: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeMessageDto {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  meta?: { questions: string[] } | { answers: string[] };
}

export interface IntakeSessionDto {
  id: string;
  projectId: string;
  messages: IntakeMessageDto[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

export type RequirementType = "functional" | "non_functional";
export type RequirementPriority = "must" | "should" | "could" | "wont";
export type RequirementStatus = "draft" | "approved" | "implemented" | "obsolete";

export interface GherkinCriterionDto {
  given: string;
  when: string;
  then: string;
}

export interface RequirementDto {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string;
  type: RequirementType;
  priority: RequirementPriority;
  actor: string | null;
  acceptanceCriteria: GherkinCriterionDto[];
  businessRules: string | null;
  dependencies: string | null;
  assumptions: string | null;
  status: RequirementStatus;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateStatusDto {
  projectStatus: ProjectStatus;
  progress: number;
  failedReason?: string;
}

/**
 * Spanish labels for values the orchestrator generates in English/technical
 * form. Shared by the frontend (display) and the backend (PDF/DOCX export)
 * so the two never drift apart.
 */
export const REQUIREMENT_TYPE_LABEL_ES: Record<RequirementType, string> = {
  functional: "Funcional",
  non_functional: "No funcional",
};

export const REQUIREMENT_PRIORITY_LABEL_ES: Record<RequirementPriority, string> = {
  must: "Obligatorio",
  should: "Recomendado",
  could: "Opcional",
  wont: "Descartado",
};

export const REQUIREMENT_STATUS_LABEL_ES: Record<RequirementStatus, string> = {
  draft: "Borrador",
  approved: "Aprobado",
  implemented: "Implementado",
  obsolete: "Obsoleto",
};

export const TEST_CASE_TYPE_LABEL_ES: Record<TestCaseType, string> = {
  functional: "Funcional",
  negative: "Negativo",
  security: "Seguridad",
  integration: "Integración",
  regression: "Regresión",
  performance: "Rendimiento",
};

export const TEST_CASE_STATUS_LABEL_ES: Record<TestCaseStatus, string> = {
  not_executed: "No ejecutado",
  passed: "Pasó",
  failed: "Falló",
  blocked: "Bloqueado",
};

export const TEST_CASE_SEVERITY_LABEL_ES: Record<TestCaseSeverity, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const HTTP_METHOD_LABEL_ES: Record<HttpMethod, string> = {
  GET: "Consultar",
  POST: "Crear",
  PATCH: "Editar parcialmente",
  PUT: "Reemplazar",
  DELETE: "Eliminar",
};

const FIELD_TYPE_LABEL_ES: Record<string, string> = {
  integer: "número entero",
  decimal: "decimal",
  varchar: "texto corto",
  text: "texto largo",
  boolean: "sí/no",
  date: "fecha",
  timestamp: "fecha y hora",
  uuid: "identificador único",
  enum: "categoría (lista fija)",
  // valores heredados por compatibilidad con datos generados en versiones anteriores
  string: "texto",
  number: "número",
  int: "número entero",
  float: "decimal",
  bool: "sí/no",
  datetime: "fecha y hora",
  json: "datos estructurados",
};

export function translateFieldType(type: string): string {
  return FIELD_TYPE_LABEL_ES[type.toLowerCase()] ?? type;
}

function stripLeadingWords(text: string, words: string[]): string {
  let result = text.trim();
  for (const word of words) {
    const re = new RegExp(`^${word}\\s+`, "i");
    if (re.test(result)) {
      result = result.replace(re, "");
      break;
    }
  }
  return result;
}

/**
 * Limpia goal/benefit de una historia de usuario para ensamblar "Como
 * <actor>, quiero <goal>, para <benefit>". Recorta un "quiero"/"para"/"para
 * que" inicial que el texto generado por IA a veces repite, ya que esas
 * palabras se anteponen al armar la oración — evita frases como "quiero
 * quiero..." o "para para que...".
 */
export function cleanUserStoryParts(goal: string, benefit: string): { goal: string; benefit: string } {
  return {
    goal: stripLeadingWords(goal, ["quiero"]),
    benefit: stripLeadingWords(benefit, ["para que", "para"]),
  };
}

/** Arma la oración completa "Como <actor>, quiero <goal>, para <benefit>". */
export function formatUserStorySentence(actor: string, goal: string, benefit: string): string {
  const clean = cleanUserStoryParts(goal, benefit);
  return `Como ${actor}, quiero ${clean.goal}, para ${clean.benefit}`;
}

export const DATA_MODEL_CARDINALITY_LABEL_ES: Record<string, string> = {
  "1:1": "uno a uno",
  "1:N": "uno a muchos",
  "N:1": "muchos a uno",
  "N:M": "muchos a muchos",
  // valores heredados (versión anterior del orquestador)
  "one-to-many": "uno a muchos",
  "many-to-one": "muchos a uno",
  "many-to-many": "muchos a muchos",
  "one-to-one": "uno a uno",
};

export const DATA_MODEL_KEY_LABEL_ES: Record<string, string> = {
  PK: "Llave primaria",
  FK: "Llave foránea",
  NONE: "",
};

export interface AcceptanceCriterionDto {
  id: string;
  userStoryId: string;
  scenarioName: string;
  given: string;
  when: string;
  then: string;
  createdAt: string;
}

export interface UserStoryDto {
  id: string;
  projectId: string;
  requirementId: string;
  code: string;
  title: string;
  actor: string;
  goal: string;
  benefit: string;
  priority: RequirementPriority | null;
  storyPoints: number | null;
  dependencies: string | null;
  definitionOfReady: string | null;
  definitionOfDone: string | null;
  createdAt: string;
  updatedAt: string;
  acceptanceCriteria: AcceptanceCriterionDto[];
  requirement: { code: string; title: string };
}

export interface DataModelFieldDto {
  name: string;
  dataType: string;
  length?: string;
  nullable: boolean;
  key: "PK" | "FK" | "NONE";
  keyTarget?: string;
  description: string;
}

export interface DataModelRelationDto {
  cardinality: "1:1" | "1:N" | "N:1" | "N:M";
  target: string;
  description: string;
}

export interface DataModelEntityDto {
  id: string;
  projectId: string;
  name: string;
  fields: DataModelFieldDto[];
  relations: DataModelRelationDto[];
  createdAt: string;
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface ApiEndpointDto {
  id: string;
  projectId: string;
  method: HttpMethod;
  path: string;
  description: string;
  createdAt: string;
}

export type TestCaseType = "functional" | "negative" | "security" | "integration" | "regression" | "performance";
export type TestCaseStatus = "not_executed" | "passed" | "failed" | "blocked";
export type TestCaseSeverity = "alta" | "media" | "baja";

export interface TestCaseDto {
  id: string;
  projectId: string;
  acceptanceCriteriaId: string;
  code: string;
  title: string;
  type: TestCaseType;
  precondition: string;
  steps: string[];
  testData: string | null;
  expectedResult: string;
  actualResult: string | null;
  status: TestCaseStatus;
  severity: TestCaseSeverity;
  createdAt: string;
  updatedAt: string;
  acceptanceCriterion: {
    scenarioName: string;
    given: string;
    when: string;
    then: string;
    userStory: { code: string; actor: string; goal: string };
  };
}

/**
 * Chat de soporte — un hilo compartido por organización, sin importar el
 * plan. Cualquier persona del equipo ve y escribe en el mismo hilo; del
 * otro lado, solo el super-admin responde (ver AdminSupportConversationDto).
 */
export interface SupportMessageDto {
  id: string;
  orgId: string;
  senderUserId: string | null;
  senderIsAdmin: boolean;
  body: string;
  readByOrg: boolean;
  readByAdmin: boolean;
  createdAt: string;
  senderUser: { name: string } | null;
}

export interface SupportUnreadCountDto {
  count: number;
}

/** Respuesta de GET /support/messages — el estado "cerrada" es siempre decisión del super-admin, nunca de la organización. */
export interface SupportThreadDto {
  closed: boolean;
  messages: SupportMessageDto[];
}

export interface AdminSupportConversationDto {
  orgId: string;
  orgName: string;
  plan: SubscriptionPlan;
  closed: boolean;
  lastMessage: SupportMessageDto | null;
  unreadCount: number;
}

export interface AdminSupportThreadDto {
  organization: { id: string; name: string; plan: SubscriptionPlan };
  closed: boolean;
  messages: (SupportMessageDto & { senderUser: { name: string; email: string } | null })[];
}

// --- Módulo: creación automática en Jira/ClickUp -------------------------

export const IntegrationProvider = {
  JIRA: "jira",
  CLICKUP: "clickup",
} as const;
export type IntegrationProvider = (typeof IntegrationProvider)[keyof typeof IntegrationProvider];

export const INTEGRATION_PROVIDER_LABEL_ES: Record<IntegrationProvider, string> = {
  jira: "Jira",
  clickup: "ClickUp",
};

export interface IntegrationTargetOption {
  id: string;
  label: string;
}

export interface SuggestedMappingDto {
  epicIssueTypeId?: string;
  epicIssueTypeName?: string;
  storyIssueTypeId?: string;
  storyIssueTypeName?: string;
  testCaseIssueTypeId?: string;
  testCaseIssueTypeName?: string;
  storyPointsFieldId?: string;
  storyPointsFieldName?: string;
  notes: string[];
}

export interface IntegrationConnectionDto {
  id: string;
  orgId: string;
  provider: IntegrationProvider;
  label: string;
  siteUrl: string | null;
  authEmail: string | null;
  status: "active" | "expired" | "revoked";
  targetId: string | null;
  targetLabel: string | null;
  mapping: SuggestedMappingDto | null;
  mappingConfirmed: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectIntegrationResultDto {
  connection: IntegrationConnectionDto;
  targets: IntegrationTargetOption[];
}

export interface SelectTargetResultDto {
  connection: IntegrationConnectionDto;
  suggestedMapping: SuggestedMappingDto;
}

export type SyncItemType = "epic" | "user_story" | "test_case";
export type SyncItemStatus = "created" | "failed";

export interface SyncItemDto {
  id: string;
  itemType: SyncItemType;
  internalCode: string;
  internalTitle: string;
  externalId: string | null;
  externalUrl: string | null;
  status: SyncItemStatus;
  errorMessage: string | null;
  createdAt: string;
}

export type SyncStatus = "in_progress" | "completed" | "completed_with_errors" | "failed";

export interface SyncRunDto {
  id: string;
  projectId: string;
  connectionId: string;
  connection: { provider: IntegrationProvider; label: string };
  sourceType: "full_study" | "single_story";
  status: SyncStatus;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  items: SyncItemDto[];
}

// --- Módulo QA-AI: automatización de pruebas web (caja negra) ------------

export type QaScopeMode = "scoped" | "full";
export type QaStepAction = "goto" | "click" | "fill" | "select" | "wait_for_text" | "assert_text" | "assert_url" | "assert_element_visible";
export type QaTestCaseStatus = "draft" | "blocked_missing_data" | "ready" | "archived";
export type QaRunStatus = "in_progress" | "passed" | "failed" | "error";
export type QaMissingDataKind = "secret" | "business";
export type QaMissingDataStatus = "pending" | "resolved";

export interface QaStepDto {
  action: QaStepAction;
  selector?: string | null;
  value?: string | null;
  dataRef?: string | null;
  description: string;
}

export interface QaDiscoveredElementDto {
  text: string;
  selector: string;
}
export interface QaDiscoveredInputDto {
  label: string;
  selector: string;
  type: string;
}
export interface QaPageStructureDto {
  url: string;
  title: string;
  headings: string[];
  buttons: QaDiscoveredElementDto[];
  links: QaDiscoveredElementDto[];
  inputs: QaDiscoveredInputDto[];
}
export interface QaDiscoveredStructureDto {
  pages: QaPageStructureDto[];
}

export interface QaTestModuleDto {
  id: string;
  orgId: string;
  name: string;
  targetUrl: string;
  scopeMode: QaScopeMode;
  description: string;
  setupSteps: QaStepDto[];
  discoveredStructure: QaDiscoveredStructureDto | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QaTestModuleSummaryDto extends QaTestModuleDto {
  _count: { testCases: number; testRuns: number };
}

export interface QaMissingDataRequestDto {
  id: string;
  orgId: string;
  testCaseId: string;
  kind: QaMissingDataKind;
  fieldKey: string;
  question: string;
  format: string;
  status: QaMissingDataStatus;
  /** Solo presente cuando kind="business" — el valor de un secreto nunca se devuelve al frontend. */
  businessValue: string | null;
  requestedAt: string;
  respondedAt: string | null;
  respondedBy: string | null;
  firstUsedRunId: string | null;
  testCase?: { code: string; title: string; moduleId: string };
}

export interface QaTestCaseDto {
  id: string;
  orgId: string;
  moduleId: string;
  code: string;
  title: string;
  severity: TestCaseSeverity;
  steps: QaStepDto[];
  expectedResult: string;
  status: QaTestCaseStatus;
  createdAt: string;
  updatedAt: string;
  missingDataRequests: QaMissingDataRequestDto[];
}

export interface QaTestRunItemDto {
  id: string;
  runId: string;
  testCaseId: string;
  status: QaRunStatus;
  errorMessage: string | null;
  screenshots: string[];
  startedAt: string;
  finishedAt: string | null;
  testCase: { code: string; title: string };
}

export interface QaTestRunDto {
  id: string;
  orgId: string;
  moduleId: string;
  status: QaRunStatus;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  triggeredBy: string;
  reportFile: string | null;
  items: QaTestRunItemDto[];
}

export interface QaModuleDetailDto {
  module: QaTestModuleDto;
  testCases: QaTestCaseDto[];
  testRuns: QaTestRunDto[];
}
