import { readFileSync } from "node:fs";
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  PageNumber,
  ShadingType,
  TabStopType,
  TextRun,
} from "docx";
import {
  REQUIREMENT_PRIORITY_LABEL_ES,
  REQUIREMENT_TYPE_LABEL_ES,
  REQUIREMENT_STATUS_LABEL_ES,
  TEST_CASE_TYPE_LABEL_ES,
  TEST_CASE_SEVERITY_LABEL_ES,
  HTTP_METHOD_LABEL_ES,
  DATA_MODEL_CARDINALITY_LABEL_ES,
  DATA_MODEL_KEY_LABEL_ES,
  translateFieldType,
  formatUserStorySentence,
} from "@devai-factory/shared-types";
import type { ExportBundle } from "./export.types";
import { COLORS, QUBIT_ICON_PATH } from "./pdf-theme";

const NAVY = COLORS.navy.replace("#", "");
const BLUE_600 = COLORS.blue600.replace("#", "");
const BLUE_400 = COLORS.blue400.replace("#", "");
const GRAY_TEXT = COLORS.grayText.replace("#", "");
const GRAY_LIGHT = COLORS.grayLight.replace("#", "");

const PRIORITY_COLOR: Record<string, string> = { must: NAVY, should: BLUE_600, could: BLUE_400, wont: GRAY_TEXT };
const SEVERITY_COLOR: Record<string, string> = { alta: NAVY, media: BLUE_600, baja: BLUE_400 };

const BULLET = "bullets";
const SUB_BULLET = "sub-bullets";

function bullet(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 20 })],
    numbering: { reference: BULLET, level: 0 },
    spacing: { after: 90, line: 270 },
  });
}

function subBullet(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, size: 19 })],
    numbering: { reference: SUB_BULLET, level: 1 },
    spacing: { after: 70, line: 260 },
  });
}

function heading1(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 380, after: 180 },
  });
}

function heading2(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: BLUE_600, size: 24 })],
    spacing: { before: 280, after: 110 },
  });
}

function heading3(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, color: NAVY, size: 22 })],
    spacing: { before: 220, after: 70 },
  });
}

function body(text: string) {
  return new Paragraph({ children: [new TextRun({ text, size: 20 })], spacing: { after: 140, line: 280 } });
}

function label(text: string) {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, color: GRAY_TEXT, size: 17 })],
    spacing: { before: 160, after: 60 },
  });
}

function badgesLine(items: { text: string; color: string }[]) {
  const children: TextRun[] = [];
  items.forEach((item, i) => {
    if (i > 0) children.push(new TextRun({ text: "   ", size: 18 }));
    children.push(new TextRun({ text: `● ${item.text}`, bold: true, color: item.color, size: 18 }));
  });
  return new Paragraph({ children, spacing: { after: 120 } });
}

export async function buildDocx(bundle: ExportBundle): Promise<Buffer> {
  const { project, requirements, stories, dataModel, apiEndpoints, testCases } = bundle;

  const storiesByRequirement = new Map<string, typeof stories>();
  for (const s of stories) {
    const list = storiesByRequirement.get(s.requirementId) ?? [];
    list.push(s);
    storiesByRequirement.set(s.requirementId, list);
  }
  const testCasesByCriterion = new Map<string, typeof testCases>();
  for (const tc of testCases) {
    const list = testCasesByCriterion.get(tc.acceptanceCriteriaId) ?? [];
    list.push(tc);
    testCasesByCriterion.set(tc.acceptanceCriteriaId, list);
  }

  const children: Paragraph[] = [];

  // --- Portada -----------------------------------------------------------
  let logoRun: ImageRun | null = null;
  try {
    const logoBuffer = readFileSync(QUBIT_ICON_PATH);
    logoRun = new ImageRun({ type: "png", data: logoBuffer, transformation: { width: 56, height: 48 } });
  } catch {
    // el ícono es decorativo; si no está disponible, seguimos sin él
  }

  children.push(
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: NAVY },
      spacing: { before: 200, after: 100 },
      children: logoRun ? [logoRun] : [],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: NAVY },
      spacing: { after: 100 },
      children: [new TextRun({ text: "QUBIT", bold: true, color: "FFFFFF", size: 20 })],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: NAVY },
      spacing: { after: 60 },
      children: [new TextRun({ text: project.name, bold: true, color: "FFFFFF", size: 40 })],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: NAVY },
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: project.storiesOnly ? "Historia de usuario generada con IA" : "Paquete de análisis generado con IA",
          color: "C7D9EC",
          size: 22,
          italics: true,
        }),
      ],
    }),
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: "FFF3D6" },
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({
          text:
            "Este documento es un borrador experto generado por inteligencia artificial. Revísalo antes de usarlo " +
            "como base contractual, de cumplimiento normativo, o en dominios regulados (salud, finanzas, legal).",
          color: "7A4B00",
          size: 18,
        }),
      ],
    }),
  );

  if (project.domain) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Dominio: ", bold: true, color: GRAY_TEXT }), new TextRun(project.domain)],
      }),
    );
  }
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: "Generado el: ", bold: true, color: GRAY_TEXT }),
        new TextRun(new Date().toLocaleDateString("es-CO", { dateStyle: "long" })),
      ],
    }),
  );

  // --- Requerimientos ------------------------------------------------------
  // En modo "solo historia de usuario" el único Requirement es un
  // contenedor técnico interno que refleja la misma historia — mostrarlo
  // como su propia sección confundiría a un cliente que solo pidió una
  // historia, no un desglose de requerimientos.
  if (!project.storiesOnly) {
    children.push(heading1(`Requerimientos (${requirements.length})`));
    for (const r of requirements) {
      children.push(heading3(`${r.code} — ${r.title}`));
      children.push(
        badgesLine([
          { text: REQUIREMENT_TYPE_LABEL_ES[r.type], color: r.type === "functional" ? BLUE_600 : NAVY },
          { text: REQUIREMENT_PRIORITY_LABEL_ES[r.priority], color: PRIORITY_COLOR[r.priority] },
          { text: REQUIREMENT_STATUS_LABEL_ES[r.status], color: GRAY_TEXT },
        ]),
      );
      if (r.actor) {
        children.push(label("Actor / Origen"), body(r.actor));
      }
      children.push(label("Descripción"), body(r.description));
      const criteria = (r.acceptanceCriteria ?? []) as unknown as { given: string; when: string; then: string }[];
      if (criteria.length > 0) {
        children.push(label("Criterios de aceptación"));
        for (const c of criteria) {
          children.push(bullet(`DADO ${c.given}, CUANDO ${c.when}, ENTONCES ${c.then}`));
        }
      }
      if (r.businessRules) children.push(label("Reglas de negocio"), body(r.businessRules));
      if (r.dependencies) children.push(label("Dependencias"), body(r.dependencies));
      if (r.assumptions) children.push(label("Supuestos y restricciones"), body(r.assumptions));
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `Versión ${r.version}`, italics: true, color: GRAY_TEXT, size: 15 })],
          spacing: { after: 200 },
        }),
      );
    }
  }

  // --- Historias de usuario --------------------------------------------
  if (stories.length > 0) {
    children.push(
      heading1(project.storiesOnly ? "Historia de usuario y criterios de aceptación" : "Historias de usuario y criterios de aceptación"),
    );
    for (const r of requirements) {
      const reqStories = storiesByRequirement.get(r.id) ?? [];
      if (reqStories.length === 0) continue;
      if (!project.storiesOnly) children.push(heading2(`${r.code} — ${r.title}`));
      for (const s of reqStories) {
        children.push(heading3(`${s.code} — ${s.title}`));
        const rowBadges = [];
        if (s.priority) rowBadges.push({ text: REQUIREMENT_PRIORITY_LABEL_ES[s.priority], color: PRIORITY_COLOR[s.priority] });
        if (s.storyPoints != null) rowBadges.push({ text: `${s.storyPoints} pts`, color: GRAY_TEXT });
        if (rowBadges.length > 0) children.push(badgesLine(rowBadges));
        children.push(body(formatUserStorySentence(s.actor, s.goal, s.benefit)));
        for (const ac of s.acceptanceCriteria) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: ac.scenarioName, bold: true, color: BLUE_600, size: 18 })],
              spacing: { before: 80 },
            }),
          );
          children.push(bullet(`DADO ${ac.given}, CUANDO ${ac.when}, ENTONCES ${ac.then}`));
          for (const tc of testCasesByCriterion.get(ac.id) ?? []) {
            children.push(subBullet(`[${TEST_CASE_TYPE_LABEL_ES[tc.type]}] ${tc.title}`));
          }
        }
        if (s.definitionOfReady) children.push(label("Definition of Ready"), body(s.definitionOfReady));
        if (s.definitionOfDone) children.push(label("Definition of Done"), body(s.definitionOfDone));
        if (s.dependencies) children.push(label("Dependencias"), body(s.dependencies));
        children.push(new Paragraph({ text: "", spacing: { after: 120 } }));
      }
    }
  }

  // --- Modelo de datos ---------------------------------------------------
  if (dataModel.length > 0) {
    children.push(heading1("Modelo de datos"));
    for (const entity of dataModel) {
      children.push(heading2(entity.name));
      for (const f of entity.fields as unknown as {
        name: string;
        dataType: string;
        length?: string;
        nullable: boolean;
        key: "PK" | "FK" | "NONE";
        keyTarget?: string;
        description: string;
      }[]) {
        const typeText = `${translateFieldType(f.dataType)}${f.length ? ` (${f.length})` : ""}`;
        const keyText = f.key !== "NONE" ? ` · ${DATA_MODEL_KEY_LABEL_ES[f.key]}${f.keyTarget ? ` → ${f.keyTarget}` : ""}` : "";
        const nullText = f.nullable ? "" : " · obligatorio";
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: f.name, bold: true, color: NAVY, font: "Consolas", size: 18 }),
              new TextRun({ text: `  ${typeText}${nullText}${keyText}`, color: GRAY_TEXT, size: 17 }),
              ...(f.description ? [new TextRun({ text: `  — ${f.description}`, size: 17 })] : []),
            ],
            spacing: { after: 20 },
          }),
        );
      }
      const relations = entity.relations as unknown as { cardinality: string; target: string; description: string }[];
      for (const rel of relations) {
        children.push(
          bullet(`${DATA_MODEL_CARDINALITY_LABEL_ES[rel.cardinality] ?? rel.cardinality} → ${rel.target}: ${rel.description}`),
        );
      }
      children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
    }
  }

  // --- API sugerida --------------------------------------------------------
  if (apiEndpoints.length > 0) {
    children.push(heading1(`API sugerida (${apiEndpoints.length} endpoints)`));
    for (const e of apiEndpoints) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${e.method} `, bold: true, color: BLUE_600, font: "Consolas" }),
            new TextRun({ text: e.path, font: "Consolas" }),
            new TextRun({
              text: ` — ${e.description} (${HTTP_METHOD_LABEL_ES[e.method as keyof typeof HTTP_METHOD_LABEL_ES]})`,
              color: GRAY_TEXT,
            }),
          ],
          spacing: { after: 40 },
        }),
      );
    }
  }

  // --- Casos de prueba ----------------------------------------------------
  if (testCases.length > 0) {
    children.push(heading1(`Casos de prueba (${testCases.length})`));
    for (const tc of testCases) {
      children.push(heading3(`${tc.code} — ${tc.title}`));
      children.push(
        badgesLine([
          { text: TEST_CASE_TYPE_LABEL_ES[tc.type], color: BLUE_600 },
          { text: TEST_CASE_SEVERITY_LABEL_ES[tc.severity], color: SEVERITY_COLOR[tc.severity] },
        ]),
      );
      children.push(label("Precondición"), body(tc.precondition));
      children.push(label("Pasos"));
      (tc.steps as unknown as string[]).forEach((step, i) => children.push(bullet(`${i + 1}. ${step}`)));
      if (tc.testData) children.push(label("Datos de prueba"), body(tc.testData));
      children.push(label("Resultado esperado"), body(tc.expectedResult));
      children.push(
        new Paragraph({
          children: [new TextRun({ text: "Estado: No ejecutado", italics: true, color: GRAY_TEXT, size: 15 })],
          spacing: { after: 200 },
        }),
      );
    }
  }

  return Packer.toBuffer(
    new Document({
      numbering: {
        config: [
          {
            reference: BULLET,
            levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT }],
          },
          {
            reference: SUB_BULLET,
            levels: [
              { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT },
              { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720 } } } },
            ],
          },
        ],
      },
      sections: [
        {
          properties: { page: { size: { width: 12240, height: 15840 } } },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
                  children: [
                    new TextRun({ text: `Qubit · ${project.name}`, size: 15, color: GRAY_TEXT }),
                    new TextRun({ text: "\t", size: 15 }),
                    new TextRun({ text: "Página ", size: 15, color: GRAY_TEXT }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 15, color: GRAY_TEXT }),
                    new TextRun({ text: " de ", size: 15, color: GRAY_TEXT }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: GRAY_TEXT }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    }),
  );
}
