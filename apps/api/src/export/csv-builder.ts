import {
  REQUIREMENT_PRIORITY_LABEL_ES,
  TEST_CASE_SEVERITY_LABEL_ES,
  TEST_CASE_TYPE_LABEL_ES,
  type RequirementPriority,
  type TestCaseSeverity,
  type TestCaseType,
} from "@devai-factory/shared-types";
import type { ExportBundle } from "./export.types";

/**
 * Archivos planos (CSV) para cargar el contenido de un proyecto directamente
 * en el importador nativo de Jira o de ClickUp, sin pasar por la
 * integración en vivo del módulo Jira/ClickUp — para quien no tiene (o no
 * quiere activar) esa integración, pero sí quiere subir el contenido sin
 * copiar y pegar historia por historia. Funciona igual para un proyecto de
 * "análisis completo" (muchos requerimientos/historias/casos) que para uno
 * de "historia de usuario" (un solo requerimiento y una sola historia,
 * cero casos de prueba) — es la misma forma de datos en ambos casos, así
 * que un solo generador cubre los dos módulos.
 */

// Jira solo entiende sus propios nombres de prioridad en inglés al
// importar — un texto como "Recomendado" no mapea a nada y el importador
// lo deja en blanco. Mismo mapeo que usa la integración en vivo
// (jira.provider.ts), duplicado a propósito: son archivos independientes
// que no deben depender uno del otro para poder tocarse por separado.
const JIRA_PRIORITY: Record<string, string> = {
  must: "Highest",
  should: "High",
  could: "Medium",
  wont: "Low",
};
const JIRA_SEVERITY_PRIORITY: Record<string, string> = {
  alta: "Highest",
  media: "Medium",
  baja: "Low",
};

const CLICKUP_PRIORITY: Record<string, string> = {
  must: "Urgent",
  should: "High",
  could: "Normal",
  wont: "Low",
};
const CLICKUP_SEVERITY_PRIORITY: Record<string, string> = {
  alta: "Urgent",
  media: "Normal",
  baja: "Low",
};

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  // Toda celda se envuelve en comillas — es válido en CSV y evita tener que
  // decidir caso por caso si el contenido necesita escaparse (comas,
  // saltos de línea y comillas son comunes en las descripciones generadas).
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",") + "\r\n";
}

function joinLines(lines: (string | null | undefined | false)[]): string {
  return lines.filter((l): l is string => Boolean(l && l.trim().length > 0)).join("\n");
}

function priorityLabel(priority: string | null): string {
  return priority ? (REQUIREMENT_PRIORITY_LABEL_ES[priority as RequirementPriority] ?? priority) : "";
}

function epicDescriptionText(epic: ExportBundle["requirements"][number]): string {
  const criteria = Array.isArray(epic.acceptanceCriteria)
    ? (epic.acceptanceCriteria as unknown as { given: string; when: string; then: string }[])
    : [];
  return joinLines([
    epic.description,
    epic.businessRules ? `Reglas de negocio: ${epic.businessRules}` : null,
    epic.dependencies ? `Dependencias: ${epic.dependencies}` : null,
    criteria.length > 0 ? "Criterios de aceptación:" : null,
    ...criteria.map((ac) => `- Dado ${ac.given}, cuando ${ac.when}, entonces ${ac.then}.`),
  ]);
}

function storyDescriptionText(story: ExportBundle["stories"][number]): string {
  const narrative = `Como ${story.actor}, quiero ${story.goal}, para ${story.benefit}.`;
  return joinLines([
    `Prioridad: ${priorityLabel(story.priority)}${story.storyPoints != null ? ` · Story points: ${story.storyPoints}` : ""}`,
    narrative,
    story.acceptanceCriteria.length > 0 ? "Criterios de aceptación:" : null,
    ...story.acceptanceCriteria.map(
      (ac) => `- [${ac.scenarioName || "Escenario"}] Dado ${ac.given}, cuando ${ac.when}, entonces ${ac.then}.`,
    ),
    story.definitionOfReady ? `Definition of Ready: ${story.definitionOfReady}` : null,
    story.definitionOfDone ? `Definition of Done: ${story.definitionOfDone}` : null,
    story.dependencies ? `Dependencias: ${story.dependencies}` : null,
  ]);
}

function testCaseDescriptionText(tc: ExportBundle["testCases"][number], parentStory?: ExportBundle["stories"][number]): string {
  const steps = Array.isArray(tc.steps) ? (tc.steps as unknown as string[]) : [];
  const typeLabel = TEST_CASE_TYPE_LABEL_ES[tc.type as TestCaseType] ?? tc.type;
  const severityLabel = TEST_CASE_SEVERITY_LABEL_ES[tc.severity as TestCaseSeverity] ?? tc.severity;
  return joinLines([
    parentStory ? `Verifica la historia: ${parentStory.code} — ${parentStory.title}` : null,
    `Tipo: ${typeLabel} · Severidad: ${severityLabel}`,
    `Precondición: ${tc.precondition || "N/A"}`,
    steps.length > 0 ? "Pasos:" : null,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    tc.testData ? `Datos de prueba: ${tc.testData}` : null,
    `Resultado esperado: ${tc.expectedResult}`,
  ]);
}

function sanitizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, "-");
}

function findParentStory(bundle: ExportBundle, testCase: ExportBundle["testCases"][number]) {
  return bundle.stories.find((s) => s.acceptanceCriteria.some((ac) => ac.id === testCase.acceptanceCriteriaId));
}

/** Estructura exacta pedida: Summary,Issue Type,Description,Epic Link,Priority,Labels,Story Points,Assignee,Reporter,Components,Fix Version */
export function buildJiraCsv(bundle: ExportBundle): Buffer {
  const header = csvRow([
    "Summary",
    "Issue Type",
    "Description",
    "Epic Link",
    "Priority",
    "Labels",
    "Story Points",
    "Assignee",
    "Reporter",
    "Components",
    "Fix Version",
  ]);

  const rows: string[] = [];

  for (const epic of bundle.requirements) {
    rows.push(
      csvRow([
        epic.title,
        "Épica",
        epicDescriptionText(epic),
        "",
        JIRA_PRIORITY[epic.priority] ?? "",
        sanitizeLabel(epic.type),
        "",
        "",
        "",
        "",
        "",
      ]),
    );
  }

  const requirementById = new Map(bundle.requirements.map((r) => [r.id, r]));
  for (const story of bundle.stories) {
    const epic = requirementById.get(story.requirementId);
    rows.push(
      csvRow([
        story.title,
        "Historia",
        storyDescriptionText(story),
        // El importador CSV clásico de Jira enlaza una historia a su épica
        // comparando este valor contra el campo "Epic Name" de la fila de
        // la épica — como Épica y Historia comparan por texto, usamos el
        // mismo título de la épica en ambas filas para que el mapeo
        // funcione al importar (columna "Epic Link" en el asistente).
        epic?.title ?? "",
        story.priority && JIRA_PRIORITY[story.priority] ? JIRA_PRIORITY[story.priority] : "",
        story.priority ? sanitizeLabel(story.priority) : "",
        story.storyPoints ?? "",
        "",
        "",
        "",
        "",
      ]),
    );
  }

  for (const testCase of bundle.testCases) {
    const parentStory = findParentStory(bundle, testCase);
    rows.push(
      csvRow([
        testCase.title,
        "Subtarea",
        testCaseDescriptionText(testCase, parentStory),
        "",
        JIRA_SEVERITY_PRIORITY[testCase.severity] ?? "",
        sanitizeLabel(testCase.type),
        "",
        "",
        "",
        "",
        "",
      ]),
    );
  }

  return Buffer.from("﻿" + header + rows.join(""), "utf8");
}

/** Estructura exacta pedida: Task Name,Status,Priority,Due Date,Start Date,Assignee,Description,Subtasks,Tags,Time Estimate,Checklist,Task Type */
export function buildClickupCsv(bundle: ExportBundle): Buffer {
  const header = csvRow([
    "Task Name",
    "Status",
    "Priority",
    "Due Date",
    "Start Date",
    "Assignee",
    "Description",
    "Subtasks",
    "Tags",
    "Time Estimate",
    "Checklist",
    "Task Type",
  ]);

  const rows: string[] = [];
  const storiesByEpic = new Map<string, ExportBundle["stories"]>();
  for (const story of bundle.stories) {
    const list = storiesByEpic.get(story.requirementId) ?? [];
    list.push(story);
    storiesByEpic.set(story.requirementId, list);
  }
  const testCasesByStory = new Map<string, ExportBundle["testCases"]>();
  for (const tc of bundle.testCases) {
    const parentStory = findParentStory(bundle, tc);
    if (!parentStory) continue;
    const list = testCasesByStory.get(parentStory.id) ?? [];
    list.push(tc);
    testCasesByStory.set(parentStory.id, list);
  }

  for (const epic of bundle.requirements) {
    const childStories = storiesByEpic.get(epic.id) ?? [];
    rows.push(
      csvRow([
        epic.title,
        "",
        CLICKUP_PRIORITY[epic.priority] ?? "",
        "",
        "",
        "",
        epicDescriptionText(epic),
        // Referencia informativa a qué historias caen bajo esta épica — el
        // importador de ClickUp no arma jerarquías automáticamente desde
        // una columna de texto, así que esto queda como guía para quien
        // hace el mapeo manual durante la importación.
        childStories.map((s) => s.title).join("; "),
        sanitizeLabel(epic.type),
        "",
        "",
        "Épica",
      ]),
    );
  }

  for (const story of bundle.stories) {
    const childTestCases = testCasesByStory.get(story.id) ?? [];
    rows.push(
      csvRow([
        story.title,
        "",
        story.priority && CLICKUP_PRIORITY[story.priority] ? CLICKUP_PRIORITY[story.priority] : "",
        "",
        "",
        "",
        storyDescriptionText(story),
        childTestCases.map((tc) => tc.title).join("; "),
        story.priority ? sanitizeLabel(story.priority) : "",
        "",
        // Los criterios de aceptación como ítems de checklist — encajan
        // literalmente con lo que la columna "Checklist" espera al mapear.
        story.acceptanceCriteria.map((ac) => `${ac.scenarioName || "Escenario"}: dado ${ac.given}, cuando ${ac.when}, entonces ${ac.then}`).join("; "),
        "Historia",
      ]),
    );
  }

  for (const testCase of bundle.testCases) {
    const parentStory = findParentStory(bundle, testCase);
    const steps = Array.isArray(testCase.steps) ? (testCase.steps as unknown as string[]) : [];
    rows.push(
      csvRow([
        testCase.title,
        "",
        CLICKUP_SEVERITY_PRIORITY[testCase.severity] ?? "",
        "",
        "",
        "",
        testCaseDescriptionText(testCase, parentStory),
        "",
        sanitizeLabel(testCase.type),
        "",
        steps.map((s, i) => `${i + 1}. ${s}`).join("; "),
        "Caso de Prueba",
      ]),
    );
  }

  return Buffer.from("﻿" + header + rows.join(""), "utf8");
}
