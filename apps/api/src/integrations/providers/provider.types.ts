/**
 * Modelo canónico (Capa 1 del módulo): lo que la plataforma genera
 * (Requirement/UserStory/TestCase), traducido a una forma neutral, sin
 * ningún concepto de Jira o ClickUp. Ver canonical-mapper.ts para el
 * traductor Project -> CanonicalPayload.
 */
export interface CanonicalAcceptanceCriterion {
  scenarioName?: string;
  given: string;
  when: string;
  then: string;
}

export interface CanonicalEpic {
  internalId: string;
  code: string;
  title: string;
  description: string;
  businessRules: string | null;
  dependencies: string | null;
  acceptanceCriteria: CanonicalAcceptanceCriterion[];
}

export interface CanonicalStory {
  internalId: string;
  code: string;
  epicInternalId: string;
  title: string;
  narrative: string;
  priority: string | null;
  storyPoints: number | null;
  acceptanceCriteria: CanonicalAcceptanceCriterion[];
  definitionOfReady: string | null;
  definitionOfDone: string | null;
  dependencies: string | null;
}

export interface CanonicalTestCase {
  internalId: string;
  code: string;
  storyInternalId: string;
  title: string;
  type: string;
  severity: string;
  precondition: string;
  steps: string[];
  testData: string | null;
  expectedResult: string;
}

export interface CanonicalPayload {
  epics: CanonicalEpic[];
  stories: CanonicalStory[];
  testCases: CanonicalTestCase[];
}

/** Credenciales de una conexión ya descifradas, listas para llamar la API del destino. */
export interface ProviderCredentials {
  siteUrl: string | null;
  authEmail: string | null;
  apiToken: string;
}

export interface DiscoveredTarget {
  id: string;
  label: string;
}

export interface DiscoveredStructure {
  targets: DiscoveredTarget[];
  raw: unknown;
}

/** Mapeo heurístico sugerido tras elegir un destino concreto (Capa 4). */
export interface SuggestedMapping {
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

export interface CreatedIssueRef {
  externalId: string;
  externalUrl: string;
}

/** Un adaptador por destino (Jira, ClickUp) — mismo contrato para ambos, para que el motor de ejecución (Capa 5) no sepa a cuál le está hablando. */
export interface IntegrationProviderAdapter {
  testConnection(creds: ProviderCredentials): Promise<void>;
  discoverStructure(creds: ProviderCredentials): Promise<DiscoveredStructure>;
  discoverTargetDetail(
    creds: ProviderCredentials,
    targetId: string,
  ): Promise<{ mapping: SuggestedMapping; raw: unknown }>;
  createEpic(
    creds: ProviderCredentials,
    targetId: string,
    mapping: SuggestedMapping,
    epic: CanonicalEpic,
  ): Promise<CreatedIssueRef>;
  createStory(
    creds: ProviderCredentials,
    targetId: string,
    mapping: SuggestedMapping,
    story: CanonicalStory,
    parentExternalId: string,
  ): Promise<CreatedIssueRef>;
  createTestCase(
    creds: ProviderCredentials,
    targetId: string,
    mapping: SuggestedMapping,
    testCase: CanonicalTestCase,
    parentExternalId: string,
  ): Promise<CreatedIssueRef>;
}

export class ProviderAuthError extends Error {}
export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
