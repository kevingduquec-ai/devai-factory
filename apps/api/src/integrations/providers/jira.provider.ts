import type {
  CanonicalEpic,
  CanonicalStory,
  CanonicalTestCase,
  CreatedIssueRef,
  DiscoveredStructure,
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

function toAdf(paragraphs: string[]): object {
  return {
    type: "doc",
    version: 1,
    content: paragraphs
      .filter((p) => p.trim().length > 0)
      .map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  };
}

function epicDescription(epic: CanonicalEpic): object {
  const lines = [epic.description];
  if (epic.businessRules) lines.push(`Reglas de negocio: ${epic.businessRules}`);
  if (epic.dependencies) lines.push(`Dependencias: ${epic.dependencies}`);
  for (const ac of epic.acceptanceCriteria) {
    lines.push(`Dado ${ac.given}, cuando ${ac.when}, entonces ${ac.then}.`);
  }
  return toAdf(lines);
}

function storyDescription(story: CanonicalStory): object {
  const lines = [story.narrative];
  if (story.definitionOfReady) lines.push(`Definition of Ready: ${story.definitionOfReady}`);
  if (story.definitionOfDone) lines.push(`Definition of Done: ${story.definitionOfDone}`);
  if (story.dependencies) lines.push(`Dependencias: ${story.dependencies}`);
  for (const ac of story.acceptanceCriteria) {
    lines.push(`[${ac.scenarioName ?? "Escenario"}] Dado ${ac.given}, cuando ${ac.when}, entonces ${ac.then}.`);
  }
  return toAdf(lines);
}

function testCaseDescription(testCase: CanonicalTestCase): object {
  const lines = [`Precondición: ${testCase.precondition || "N/A"}`];
  testCase.steps.forEach((step, i) => lines.push(`Paso ${i + 1}: ${step}`));
  if (testCase.testData) lines.push(`Datos de prueba: ${testCase.testData}`);
  lines.push(`Resultado esperado: ${testCase.expectedResult}`);
  return toAdf(lines);
}

interface JiraIssueTypeField {
  key: string;
  name: string;
  required: boolean;
  schema?: { type?: string; custom?: string };
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
        notes.push('No se encontró un campo "Story Points" — los puntos de historia no se enviarán, solo el resto de la historia.');
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
      // equipo (el modelo por defecto en Jira Cloud desde hace años). En
      // proyectos clásicos ("company-managed") esto puede requerir el campo
      // custom "Epic Link" en su lugar — si Jira lo rechaza, el ítem queda
      // registrado como fallido con el motivo real, para que el cliente lo
      // re-mapee (ver sección 8 del módulo: nunca falla en silencio).
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
