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

const API_BASE = "https://api.clickup.com/api/v2";

/** ClickUp priority nativa: 1=Urgent, 2=High, 3=Normal, 4=Low. */
const PRIORITY_MAP: Record<string, number> = {
  must: 1,
  should: 2,
  could: 3,
  wont: 4,
};

function authHeader(creds: ProviderCredentials): Record<string, string> {
  return { Authorization: creds.apiToken };
}

// --- Construcción de la descripción en Markdown ---------------------------
// ClickUp renderiza `markdown_content` en su editor enriquecido (encabezados,
// negritas, listas numeradas) — se usa en vez de `description` (texto plano)
// para que la historia se vea igual de clara y estructurada que en Qubit,
// sin que el desarrollador tenga que descifrar un bloque de texto corrido.
function section(title: string, body: string): string {
  return `## ${title}\n${body}`;
}

function epicMarkdown(epic: CanonicalEpic): string {
  const parts = [section("Descripción", epic.description)];
  if (epic.businessRules) parts.push(section("Reglas de negocio", epic.businessRules));
  if (epic.dependencies) parts.push(section("Dependencias", epic.dependencies));
  if (epic.acceptanceCriteria.length > 0) {
    const list = epic.acceptanceCriteria.map((ac) => `- **Dado** ${ac.given} **cuando** ${ac.when} **entonces** ${ac.then}.`).join("\n");
    parts.push(section("Criterios de aceptación", list));
  }
  return parts.join("\n\n");
}

function storyMarkdown(story: CanonicalStory): string {
  const priorityLabel = story.priority ? REQUIREMENT_PRIORITY_LABEL_ES[story.priority as RequirementPriority] : null;
  const summary = [priorityLabel ? `**Prioridad:** ${priorityLabel}` : null, story.storyPoints != null ? `**Story points:** ${story.storyPoints}` : null]
    .filter((v): v is string => Boolean(v))
    .join(" · ");

  const parts: string[] = [];
  if (summary) parts.push(summary);
  parts.push(section("Historia de usuario", story.narrative));
  if (story.acceptanceCriteria.length > 0) {
    const list = story.acceptanceCriteria
      .map((ac, i) => `${i + 1}. **${ac.scenarioName || `Escenario ${i + 1}`}**\n   - Dado ${ac.given}\n   - Cuando ${ac.when}\n   - Entonces ${ac.then}`)
      .join("\n");
    parts.push(section("Criterios de aceptación", list));
  }
  if (story.definitionOfReady) parts.push(section("Definition of Ready", story.definitionOfReady));
  if (story.definitionOfDone) parts.push(section("Definition of Done", story.definitionOfDone));
  if (story.dependencies) parts.push(section("Dependencias", story.dependencies));
  return parts.join("\n\n");
}

function testCaseMarkdown(testCase: CanonicalTestCase): string {
  const typeLabel = TEST_CASE_TYPE_LABEL_ES[testCase.type as TestCaseType] ?? testCase.type;
  const severityLabel = TEST_CASE_SEVERITY_LABEL_ES[testCase.severity as TestCaseSeverity] ?? testCase.severity;
  const parts = [
    `**Tipo:** ${typeLabel} · **Severidad:** ${severityLabel}`,
    section("Precondición", testCase.precondition || "N/A"),
  ];
  if (testCase.steps.length > 0) {
    parts.push(section("Pasos", testCase.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")));
  }
  if (testCase.testData) parts.push(section("Datos de prueba", testCase.testData));
  parts.push(section("Resultado esperado", testCase.expectedResult));
  return parts.join("\n\n");
}

interface ClickUpList {
  id: string;
  name: string;
}

async function createStoryPointsField(creds: ProviderCredentials, listId: string): Promise<{ id: string; name: string } | null> {
  try {
    const { body } = await httpJson(`${API_BASE}/list/${listId}/field`, {
      method: "POST",
      headers: { ...authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "Story Points", type: "number" }),
    });
    const field = (body as { field: { id: string; name: string } }).field;
    return { id: field.id, name: field.name };
  } catch {
    // Best-effort: si falla (permisos, plan del cliente, etc.) se degrada
    // con gracia — la historia se sigue creando, solo sin story points.
    return null;
  }
}

export const clickupProvider: IntegrationProviderAdapter = {
  async testConnection(creds) {
    await httpJson(`${API_BASE}/user`, { headers: { ...authHeader(creds), Accept: "application/json" } });
  },

  async discoverStructure(creds): Promise<DiscoveredStructure> {
    const { body: teamsBody } = await httpJson(`${API_BASE}/team`, { headers: { ...authHeader(creds), Accept: "application/json" } });
    const teams = ((teamsBody as { teams?: { id: string; name: string }[] })?.teams ?? []);

    const targets: DiscoveredTarget[] = [];
    const rawStructure: Record<string, unknown> = {};

    for (const team of teams) {
      const { body: spacesBody } = await httpJson(`${API_BASE}/team/${team.id}/space?archived=false`, {
        headers: { ...authHeader(creds), Accept: "application/json" },
      });
      const spaces = ((spacesBody as { spaces?: { id: string; name: string }[] })?.spaces ?? []);

      for (const space of spaces) {
        const [foldersRes, folderlessListsRes] = await Promise.all([
          httpJson(`${API_BASE}/space/${space.id}/folder?archived=false`, { headers: { ...authHeader(creds), Accept: "application/json" } }),
          httpJson(`${API_BASE}/space/${space.id}/list?archived=false`, { headers: { ...authHeader(creds), Accept: "application/json" } }),
        ]);
        const folders = ((foldersRes.body as { folders?: { id: string; name: string; lists?: ClickUpList[] }[] })?.folders ?? []);
        const folderlessLists = ((folderlessListsRes.body as { lists?: ClickUpList[] })?.lists ?? []);

        for (const list of folderlessLists) {
          targets.push({ id: list.id, label: `${team.name} / ${space.name} / ${list.name}` });
        }
        for (const folder of folders) {
          for (const list of folder.lists ?? []) {
            targets.push({ id: list.id, label: `${team.name} / ${space.name} / ${folder.name} / ${list.name}` });
          }
        }
      }
      rawStructure[team.id] = { name: team.name, spaceCount: spaces.length };
    }

    return { targets, raw: rawStructure };
  },

  /**
   * Crea un Espacio y una Lista nuevos cuando el workspace del cliente no
   * tenía ninguna lista todavía — nunca toca espacios/listas existentes,
   * solo añade una aislada para las historias de Qubit.
   */
  async createDefaultTarget(creds): Promise<DiscoveredTarget> {
    const { body: teamsBody } = await httpJson(`${API_BASE}/team`, { headers: { ...authHeader(creds), Accept: "application/json" } });
    const teams = ((teamsBody as { teams?: { id: string; name: string }[] })?.teams ?? []);
    const team = teams[0];
    if (!team) {
      throw new Error("Esta cuenta de ClickUp no tiene ningún workspace disponible");
    }

    const { body: spaceBody } = await httpJson(`${API_BASE}/team/${team.id}/space`, {
      method: "POST",
      headers: { ...authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "Qubit" }),
    });
    const space = spaceBody as { id: string; name: string };

    const { body: listBody } = await httpJson(`${API_BASE}/space/${space.id}/list`, {
      method: "POST",
      headers: { ...authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: "Historias de Usuario" }),
    });
    const list = listBody as { id: string; name: string };

    return { id: list.id, label: `${team.name} / ${space.name} / ${list.name} — creado automáticamente` };
  },

  async discoverTargetDetail(creds, targetId) {
    const { body } = await httpJson(`${API_BASE}/list/${targetId}/field`, { headers: { ...authHeader(creds), Accept: "application/json" } });
    const fields = ((body as { fields?: { id: string; name: string; type: string }[] })?.fields ?? []);
    const notes: string[] = [];

    let pointsField = fields.find((f) => /point/i.test(f.name) && (f.type === "number" || f.type === "labels"));
    if (!pointsField) {
      const created = await createStoryPointsField(creds, targetId);
      if (created) {
        pointsField = { id: created.id, name: created.name, type: "number" };
        notes.push('Esta lista no tenía un campo de "puntos" — se creó automáticamente el campo numérico "Story Points".');
      } else {
        notes.push('No se encontró (ni se pudo crear) un campo de "puntos" en esta lista — los story points no se enviarán.');
      }
    }

    const mapping: SuggestedMapping = {
      storyPointsFieldId: pointsField?.id,
      storyPointsFieldName: pointsField?.name,
      notes,
    };

    return { mapping, raw: { fields: fields.map((f) => ({ id: f.id, name: f.name, type: f.type })) } };
  },

  async createEpic(creds, targetId, _mapping, epic): Promise<CreatedIssueRef> {
    const { body } = await httpJson(`${API_BASE}/list/${targetId}/task`, {
      method: "POST",
      headers: { ...authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: `[Épica] ${epic.title}`, markdown_content: epicMarkdown(epic), tags: ["epica"] }),
    });
    const task = body as { id: string; url: string };
    return { externalId: task.id, externalUrl: task.url };
  },

  async createStory(creds, targetId, mapping, story, parentExternalId): Promise<CreatedIssueRef> {
    const customFields = mapping.storyPointsFieldId && story.storyPoints != null
      ? [{ id: mapping.storyPointsFieldId, value: story.storyPoints }]
      : undefined;
    const { body } = await httpJson(`${API_BASE}/list/${targetId}/task`, {
      method: "POST",
      headers: { ...authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: story.title,
        markdown_content: storyMarkdown(story),
        parent: parentExternalId,
        priority: story.priority && PRIORITY_MAP[story.priority] ? PRIORITY_MAP[story.priority] : undefined,
        custom_fields: customFields,
      }),
    });
    const task = body as { id: string; url: string };
    return { externalId: task.id, externalUrl: task.url };
  },

  async createTestCase(creds, targetId, _mapping, testCase, parentExternalId): Promise<CreatedIssueRef> {
    const { body } = await httpJson(`${API_BASE}/list/${targetId}/task`, {
      method: "POST",
      headers: { ...authHeader(creds), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: `[CP] ${testCase.title}`, markdown_content: testCaseMarkdown(testCase), parent: parentExternalId }),
    });
    const task = body as { id: string; url: string };
    return { externalId: task.id, externalUrl: task.url };
  },
};
