import {
  REQUIREMENT_PRIORITY_LABEL_ES,
  TEST_CASE_SEVERITY_LABEL_ES,
  TEST_CASE_TYPE_LABEL_ES,
  type RequirementPriority,
  type TestCaseSeverity,
  type TestCaseType,
} from "@devai-factory/shared-types";
import type {
  CanonicalEpic,
  CanonicalStory,
  CanonicalTestCase,
  CreatedIssueRef,
  DiscoveredStructure,
  DiscoveredTarget,
  IntegrationProviderAdapter,
  ProviderCredentials,
  SuggestedMapping,
} from "./provider.types";
import { httpJson } from "./http-retry";
import { ProviderRequestError } from "./provider.types";

/**
 * Autenticación por API token (Basic Auth email:token), no OAuth 2.0. El
 * flujo OAuth de 3 patas que describe la propuesta original necesita una
 * app registrada en el panel de desarrolladores de Atlassian (client id/
 * secret, callback URL) — algo que hay que dar de alta fuera de este
 * sistema. El API token es el método de autenticación soportado
 * oficialmente por Jira Cloud para integraciones servidor-a-servidor sin
 * ese registro previo, y es el que el cliente puede generar él mismo desde
 * id.atlassian.com/manage-profile/security/api-tokens. OAuth queda como
 * mejora futura (Fase de Resiliencia) si se registra la app.
 */

const PRIORITY_MAP: Record<string, string> = {
  must: "Highest",
  should: "High",
  could: "Medium",
  wont: "Low",
};

function authHeader(creds: ProviderCredentials): string {
  const basic = Buffer.from(`${creds.authEmail}:${creds.apiToken}`).toString("base64");
  return `Basic ${basic}`;
}

function baseUrl(creds: ProviderCredentials): string {
  if (!creds.siteUrl) throw new Error("Falta la URL del sitio de Jira");
  return creds.siteUrl.replace(/\/+$/, "");
}

// --- Construcción de contenido ADF (Atlassian Document Format) -----------
// La descripción de un issue en Jira Cloud v3 no acepta texto plano: hay
// que mandar un documento estructurado. Se aprovecha para que la historia
// quede realmente legible en Jira (encabezados + listas anidadas), no un
// bloque de texto plano — así el desarrollador que la abre ve la misma
// estructura clara que ya tiene en Qubit, sin tener que re-formatear nada.
type AdfNode = Record<string, unknown>;

function heading(level: number, text: string): AdfNode {
  return { type: "heading", attrs: { level }, content: [{ type: "text", text }] };
}
function paragraph(text: string): AdfNode {
  return { type: "paragraph", content: [{ type: "text", text }] };
}
function paragraphMuted(text: string): AdfNode {
  return { type: "paragraph", content: [{ type: "text", text, marks: [{ type: "em" }] }] };
}
function orderedList(items: string[]): AdfNode {
  return { type: "orderedList", content: items.map((t) => ({ type: "listItem", content: [paragraph(t)] })) };
}
function doc(content: AdfNode[]): object {
  return { type: "doc", version: 1, content };
}

function scenarioListItem(ac: { scenarioName?: string; given: string; when: string; then: string }, index: number): AdfNode {
  return {
    type: "listItem",
    content: [
      { type: "paragraph", content: [{ type: "text", text: ac.scenarioName || `Escenario ${index + 1}`, marks: [{ type: "strong" }] }] },
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [paragraph(`Dado ${ac.given}`)] },
          { type: "listItem", content: [paragraph(`Cuando ${ac.when}`)] },
          { type: "listItem", content: [paragraph(`Entonces ${ac.then}`)] },
        ],
      },
    ],
  };
}
function acceptanceCriteriaList(criteria: { scenarioName?: string; given: string; when: string; then: string }[]): AdfNode {
  return { type: "bulletList", content: criteria.map((ac, i) => scenarioListItem(ac, i)) };
}

function epicDescription(epic: CanonicalEpic): object {
  const content: AdfNode[] = [heading(3, "Descripción"), paragraph(epic.description)];
  if (epic.businessRules) content.push(heading(3, "Reglas de negocio"), paragraph(epic.businessRules));
  if (epic.dependencies) content.push(heading(3, "Dependencias"), paragraph(epic.dependencies));
  if (epic.acceptanceCriteria.length > 0) {
    content.push(heading(3, "Criterios de aceptación"), acceptanceCriteriaList(epic.acceptanceCriteria));
  }
  return doc(content);
}

function storyDescription(story: CanonicalStory): object {
  const priorityLabel = story.priority ? REQUIREMENT_PRIORITY_LABEL_ES[story.priority as RequirementPriority] : null;
  const summary = [priorityLabel ? `Prioridad: ${priorityLabel}` : null, story.storyPoints != null ? `Story points: ${story.storyPoints}` : null]
    .filter((v): v is string => Boolean(v))
    .join(" · ");

  const content: AdfNode[] = [];
  if (summary) content.push(paragraphMuted(summary));
  content.push(heading(3, "Historia de usuario"), paragraph(story.narrative));
  if (story.acceptanceCriteria.length > 0) {
    content.push(heading(3, "Criterios de aceptación"), acceptanceCriteriaList(story.acceptanceCriteria));
  }
  if (story.definitionOfReady) content.push(heading(3, "Definition of Ready"), paragraph(story.definitionOfReady));
  if (story.definitionOfDone) content.push(heading(3, "Definition of Done"), paragraph(story.definitionOfDone));
  if (story.dependencies) content.push(heading(3, "Dependencias"), paragraph(story.dependencies));
  return doc(content);
}

function testCaseDescription(testCase: CanonicalTestCase): object {
  const typeLabel = TEST_CASE_TYPE_LABEL_ES[testCase.type as TestCaseType] ?? testCase.type;
  const severityLabel = TEST_CASE_SEVERITY_LABEL_ES[testCase.severity as TestCaseSeverity] ?? testCase.severity;
  const content: AdfNode[] = [
    paragraphMuted(`Tipo: ${typeLabel} · Severidad: ${severityLabel}`),
    heading(3, "Precondición"),
    paragraph(testCase.precondition || "N/A"),
  ];
  if (testCase.steps.length > 0) content.push(heading(3, "Pasos"), orderedList(testCase.steps));
  if (testCase.testData) content.push(heading(3, "Datos de prueba"), paragraph(testCase.testData));
  content.push(heading(3, "Resultado esperado"), paragraph(testCase.expectedResult));
  return doc(content);
}

interface JiraIssueType {
  id: string;
  name: string;
  subtask: boolean;
  fields: Record<string, { name: string; required: boolean; schema?: { type?: string; custom?: string } }>;
}

async function fetchCreateMeta(creds: ProviderCredentials, projectKey: string): Promise<JiraIssueType[]> {
  const url = `${baseUrl(creds)}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projectKey)}&expand=projects.issuetypes.fields`;
  const { body } = await httpJson(url, { headers: { Authorization: authHeader(creds), Accept: "application/json" } });
  const projects = (body as { projects?: unknown[] })?.projects ?? [];
  const project = projects[0] as { issuetypes?: JiraIssueType[] } | undefined;
  return project?.issuetypes ?? [];
}

function pickIssueType(issueTypes: JiraIssueType[], pattern: RegExp, excludeSubtask = true): JiraIssueType | undefined {
  return issueTypes.find((t) => (!excludeSubtask || !t.subtask) && pattern.test(t.name));
}

async function fetchAccountId(creds: ProviderCredentials): Promise<string> {
  const { body } = await httpJson(`${baseUrl(creds)}/rest/api/3/myself`, {
    headers: { Authorization: authHeader(creds), Accept: "application/json" },
  });
  return (body as { accountId: string }).accountId;
}

function randomProjectKey(): string {
  return `QBT${Math.floor(1000 + Math.random() * 9000)}`;
}

export const jiraProvider: IntegrationProviderAdapter = {
  async testConnection(creds) {
    const url = `${baseUrl(creds)}/rest/api/3/myself`;
    await httpJson(url, { headers: { Authorization: authHeader(creds), Accept: "application/json" } });
  },

  async discoverStructure(creds): Promise<DiscoveredStructure> {
    const url = `${baseUrl(creds)}/rest/api/3/project/search?maxResults=50`;
    const { body } = await httpJson(url, { headers: { Authorization: authHeader(creds), Accept: "application/json" } });
    const values = ((body as { values?: unknown[] })?.values ?? []) as { key: string; name: string }[];
    return {
      targets: values.map((p) => ({ id: p.key, label: `${p.name} (${p.key})` })),
      raw: { projects: values.map((p) => ({ key: p.key, name: p.name })) },
    };
  },

  /**
   * Crea un proyecto Jira nuevo, gestionado por equipo ("team-managed"),
   * cuando la cuenta no tenía ninguno — este tipo de proyecto trae por
   * defecto los tipos de issue Épica/Historia/Subtarea que el mapeo
   * necesita, sin tocar ningún proyecto existente del cliente. Los story
   * points no vienen habilitados por defecto en un proyecto nuevo (Jira
   * los deja como función opcional, "Estimación", que solo se activa desde
   * la configuración del proyecto) — se degrada con gracia igual que en
   * discoverTargetDetail, en vez de fingir que sí quedaron disponibles.
   */
  async createDefaultTarget(creds): Promise<DiscoveredTarget> {
    const accountId = await fetchAccountId(creds);
    const name = "Qubit - Historias de Usuario";
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = randomProjectKey();
      try {
        const { body } = await httpJson(`${baseUrl(creds)}/rest/api/3/project`, {
          method: "POST",
          headers: { Authorization: authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            key,
            name,
            projectTypeKey: "software",
            projectTemplateKey: "com.pyxis.greenhopper.jira:gh-simplified-agility-kanban",
            leadAccountId: accountId,
          }),
        });
        const created = body as { key: string };
        return { id: created.key, label: `${name} (${created.key}) — creado automáticamente` };
      } catch (error) {
        lastError = error;
        // Solo reintenta con otra key si el 400 fue por choque de key —
        // cualquier otro error (permisos, plan, etc.) se propaga de inmediato.
        if (!(error instanceof ProviderRequestError) || error.status !== 400) {
          throw error;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No se pudo crear un proyecto de Jira automáticamente");
  },

  async discoverTargetDetail(creds, targetId) {
    const issueTypes = await fetchCreateMeta(creds, targetId);
    const notes: string[] = [];

    const epicType = pickIssueType(issueTypes, /epic|épica/i);
    const storyType = pickIssueType(issueTypes, /story|historia/i) ?? pickIssueType(issueTypes, /task|tarea/i);
    const subtaskType = issueTypes.find((t) => t.subtask);

    if (!epicType) notes.push('No se encontró un tipo de issue "Épica" en este proyecto — los requerimientos no se podrán enviar como épicas.');
    if (!storyType) notes.push('No se encontró un tipo de issue de historia/tarea — no se podrá enviar contenido a este proyecto.');
    if (!subtaskType) notes.push('Este proyecto no tiene un tipo de subtarea — los casos de prueba no se podrán crear (se omitirán en el envío).');

    let storyPointsFieldId: string | undefined;
    let storyPointsFieldName: string | undefined;
    if (storyType) {
      const fieldsEntries = Object.entries(storyType.fields);
      const match = fieldsEntries.find(([, f]) => /story point/i.test(f.name));
      if (match) {
        storyPointsFieldId = match[0];
        storyPointsFieldName = match[1].name;
      } else {
        notes.push(
          'No se encontró un campo "Story Points" en este proyecto — los puntos de historia no se enviarán (el resto de la historia sí). Actívalo en Jira desde Configuración del proyecto → Funciones → Estimación (elige "Puntos de historia") y vuelve a "Detectar de nuevo".',
        );
      }
    }

    const mapping: SuggestedMapping = {
      epicIssueTypeId: epicType?.id,
      epicIssueTypeName: epicType?.name,
      storyIssueTypeId: storyType?.id,
      storyIssueTypeName: storyType?.name,
      testCaseIssueTypeId: subtaskType?.id,
      testCaseIssueTypeName: subtaskType?.name,
      storyPointsFieldId,
      storyPointsFieldName,
      notes,
    };

    return { mapping, raw: { issueTypes: issueTypes.map((t) => ({ id: t.id, name: t.name, subtask: t.subtask })) } };
  },

  async createEpic(creds, targetId, mapping, epic): Promise<CreatedIssueRef> {
    if (!mapping.epicIssueTypeId) {
      throw new ProviderRequestError('El mapeo no tiene un tipo de issue para "Épica" configurado', 400);
    }
    const url = `${baseUrl(creds)}/rest/api/3/issue`;
    const { body } = await httpJson(url, {
      method: "POST",
      headers: { Authorization: authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        fields: {
          project: { key: targetId },
          issuetype: { id: mapping.epicIssueTypeId },
          summary: epic.title,
          description: epicDescription(epic),
        },
      }),
    });
    const key = (body as { key: string }).key;
    return { externalId: key, externalUrl: `${baseUrl(creds)}/browse/${key}` };
  },

  async createStory(creds, targetId, mapping, story, parentExternalId): Promise<CreatedIssueRef> {
    if (!mapping.storyIssueTypeId) {
      throw new ProviderRequestError("El mapeo no tiene un tipo de issue para historias configurado", 400);
    }
    const fields: Record<string, unknown> = {
      project: { key: targetId },
      issuetype: { id: mapping.storyIssueTypeId },
      summary: story.title,
      description: storyDescription(story),
      // "parent" enlaza la historia a su épica en proyectos gestionados por
      // equipo (el modelo por defecto en Jira Cloud desde hace años, y el
      // que usa createDefaultTarget). En proyectos clásicos ("company-
      // managed") esto puede requerir el campo custom "Epic Link" en su
      // lugar — si Jira lo rechaza, el ítem queda registrado como fallido
      // con el motivo real, para que el cliente lo re-mapee (sección 8:
      // nunca falla en silencio).
      parent: { key: parentExternalId },
      priority: story.priority && PRIORITY_MAP[story.priority] ? { name: PRIORITY_MAP[story.priority] } : undefined,
    };
    if (mapping.storyPointsFieldId && story.storyPoints != null) {
      fields[mapping.storyPointsFieldId] = story.storyPoints;
    }
    const url = `${baseUrl(creds)}/rest/api/3/issue`;
    const { body } = await httpJson(url, {
      method: "POST",
      headers: { Authorization: authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ fields }),
    });
    const key = (body as { key: string }).key;
    return { externalId: key, externalUrl: `${baseUrl(creds)}/browse/${key}` };
  },

  async createTestCase(creds, targetId, mapping, testCase, parentExternalId): Promise<CreatedIssueRef> {
    if (!mapping.testCaseIssueTypeId) {
      throw new ProviderRequestError("Este proyecto no tiene un tipo de subtarea para casos de prueba", 400);
    }
    const url = `${baseUrl(creds)}/rest/api/3/issue`;
    const { body } = await httpJson(url, {
      method: "POST",
      headers: { Authorization: authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        fields: {
          project: { key: targetId },
          issuetype: { id: mapping.testCaseIssueTypeId },
          summary: testCase.title,
          description: testCaseDescription(testCase),
          parent: { key: parentExternalId },
        },
      }),
    });
    const key = (body as { key: string }).key;
    return { externalId: key, externalUrl: `${baseUrl(creds)}/browse/${key}` };
  },
};
