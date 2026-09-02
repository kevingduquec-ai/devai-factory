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

function taskDescription(lines: string[]): string {
  return lines.filter((l) => l.trim().length > 0).join("\n\n");
}

function epicDescription(epic: CanonicalEpic): string {
  const lines = [epic.description];
  if (epic.businessRules) lines.push(`Reglas de negocio: ${epic.businessRules}`);
  if (epic.dependencies) lines.push(`Dependencias: ${epic.dependencies}`);
  for (const ac of epic.acceptanceCriteria) lines.push(`Dado ${ac.given}, cuando ${ac.when}, entonces ${ac.then}.`);
  return taskDescription(lines);
}

function storyDescription(story: CanonicalStory): string {
  const lines = [story.narrative];
  if (story.definitionOfReady) lines.push(`Definition of Ready: ${story.definitionOfReady}`);
  if (story.definitionOfDone) lines.push(`Definition of Done: ${story.definitionOfDone}`);
  if (story.dependencies) lines.push(`Dependencias: ${story.dependencies}`);
  for (const ac of story.acceptanceCriteria) {
    lines.push(`[${ac.scenarioName ?? "Escenario"}] Dado ${ac.given}, cuando ${ac.when}, entonces ${ac.then}.`);
  }
  return taskDescription(lines);
}

function testCaseDescription(testCase: CanonicalTestCase): string {
  const lines = [`Precondición: ${testCase.precondition || "N/A"}`];
  testCase.steps.forEach((step, i) => lines.push(`Paso ${i + 1}: ${step}`));
  if (testCase.testData) lines.push(`Datos de prueba: ${testCase.testData}`);
  lines.push(`Resultado esperado: ${testCase.expectedResult}`);
  return taskDescription(lines);
}

interface ClickUpList {
  id: string;
  name: string;
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

  async discoverTargetDetail(creds, targetId) {
    const { body } = await httpJson(`${API_BASE}/list/${targetId}/field`, { headers: { ...authHeader(creds), Accept: "application/json" } });
    const fields = ((body as { fields?: { id: string; name: string; type: string }[] })?.fields ?? []);
    const notes: string[] = [];

    const pointsField = fields.find((f) => /point/i.test(f.name) && (f.type === "number" || f.type === "labels"));
    if (!pointsField) {
      notes.push('No se encontró un campo personalizado de "puntos" en esta lista — los story points no se enviarán. Puedes crear un campo numérico llamado "Story Points" en ClickUp y volver a detectar.');
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
      body: JSON.stringify({ name: `[Épica] ${epic.title}`, description: epicDescription(epic), tags: ["epica"] }),
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
        description: storyDescription(story),
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
      body: JSON.stringify({ name: `[CP] ${testCase.title}`, description: testCaseDescription(testCase), parent: parentExternalId }),
    });
    const task = body as { id: string; url: string };
    return { externalId: task.id, externalUrl: task.url };
  },
};
