import PDFDocument from "pdfkit";
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
import { COLORS, QUBIT_ICON_PATH, divider, pill, registerFonts } from "./pdf-theme";

const PRIORITY_BG: Record<string, string> = {
  must: COLORS.navy,
  should: COLORS.blue600,
  could: COLORS.blue400,
  wont: COLORS.grayText,
};

const SEVERITY_BG: Record<string, string> = {
  alta: COLORS.navy,
  media: COLORS.blue600,
  baja: COLORS.blue400,
};

export async function buildPdf(bundle: ExportBundle): Promise<Buffer> {
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

  const doc = new PDFDocument({ size: "LETTER", margin: 54, bufferPages: true });
  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const contentLeft = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const h1 = (text: string) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 90) doc.addPage();
    doc.moveDown(1.4).fillColor(COLORS.navy).font("Sans-Bold").fontSize(16).text(text).moveDown(0.6);
    doc.fillColor("black");
  };
  const h2 = (text: string) =>
    doc.moveDown(0.8).fillColor(COLORS.blue600).font("Sans-Bold").fontSize(12).text(text).fillColor("black").moveDown(0.3);
  const label = (text: string) =>
    doc.moveDown(0.35).font("Sans-Bold").fontSize(8.5).fillColor(COLORS.grayText).text(text.toUpperCase()).moveDown(0.08);
  const body = (text: string) =>
    doc.font("Sans").fontSize(10).fillColor("black").text(text, { align: "left", lineGap: 2.5 });
  const bullet = (text: string, indent = 0) =>
    doc
      .font("Sans")
      .fontSize(9.5)
      .fillColor("black")
      .text(`•  ${text}`, { indent: 12 + indent * 14, lineGap: 2 });

  function pillRow(items: { text: string; bg: string; color?: string }[]) {
    let x = contentLeft;
    const y = doc.y;
    for (const item of items) {
      const w = pill(doc, item.text, x, y, { bg: item.bg, color: item.color });
      x += w + 6;
    }
    doc.y = y + 16;
    doc.x = contentLeft;
  }

  // --- Portada -------------------------------------------------------
  const bandHeight = 150;
  doc.rect(0, 0, doc.page.width, bandHeight).fill(COLORS.navy);
  try {
    doc.image(QUBIT_ICON_PATH, contentLeft, 34, { height: 40 });
  } catch {
    // el ícono es decorativo; si no está disponible, seguimos sin él
  }
  doc
    .fillColor(COLORS.white)
    .font("Sans-Bold")
    .fontSize(13)
    .text("Qubit", contentLeft + 52, 42, { lineBreak: false });
  doc.font("Sans").fontSize(9).fillColor(COLORS.blue400).text("AI Requirements & QA", contentLeft + 52, 62, { lineBreak: false });

  doc.fillColor(COLORS.white).font("Sans-Bold").fontSize(24).text(project.name, contentLeft, 92, { width: contentWidth - 100 });
  doc
    .font("Sans")
    .fontSize(11)
    .fillColor("#C7D9EC")
    .text(project.storiesOnly ? "Historia de usuario generada con IA" : "Paquete de análisis generado con IA", contentLeft, doc.y + 2);

  doc.y = bandHeight + 24;
  doc.x = contentLeft;

  doc
    .roundedRect(contentLeft, doc.y, contentWidth, 46, 4)
    .fill("#FFF3D6");
  doc
    .fillColor("#7A4B00")
    .font("Sans")
    .fontSize(8.5)
    .text(
      "Este documento es un borrador experto generado por inteligencia artificial. Revísalo antes de usarlo " +
        "como base contractual, de cumplimiento normativo, o en dominios regulados (salud, finanzas, legal).",
      contentLeft + 10,
      doc.y + 8,
      { width: contentWidth - 20 },
    );
  doc.fillColor("black");
  doc.y += 46 + 14;
  doc.x = contentLeft;

  doc.font("Sans-Bold").fontSize(9).fillColor(COLORS.grayText);
  if (project.domain) doc.text(`Dominio: ${project.domain}`);
  doc.text(`Generado el: ${new Date().toLocaleDateString("es-CO", { dateStyle: "long" })}`);
  doc.fillColor("black");

  // --- Requerimientos --------------------------------------------------
  // En modo "solo historia de usuario" el único Requirement es un
  // contenedor técnico interno que refleja la misma historia — mostrarlo
  // como su propia sección confundiría a un cliente que solo pidió una
  // historia, no un desglose de requerimientos.
  if (!project.storiesOnly) {
    h1(`Requerimientos (${requirements.length})`);
    for (const r of requirements) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 100) doc.addPage();
      doc.font("Sans-Bold").fontSize(11).fillColor(COLORS.navy).text(`${r.code} — ${r.title}`);
      doc.fillColor("black");
      pillRow([
        { text: REQUIREMENT_TYPE_LABEL_ES[r.type], bg: r.type === "functional" ? COLORS.blue600 : COLORS.navy },
        { text: REQUIREMENT_PRIORITY_LABEL_ES[r.priority], bg: PRIORITY_BG[r.priority] },
        { text: REQUIREMENT_STATUS_LABEL_ES[r.status], bg: COLORS.grayLight, color: COLORS.navy },
      ]);
      if (r.actor) {
        label("Actor / Origen");
        body(r.actor);
      }
      label("Descripción");
      body(r.description);
      const criteria = (r.acceptanceCriteria ?? []) as unknown as { given: string; when: string; then: string }[];
      if (criteria.length > 0) {
        label("Criterios de aceptación");
        for (const c of criteria) {
          bullet(`DADO ${c.given}, CUANDO ${c.when}, ENTONCES ${c.then}`);
        }
      }
      if (r.businessRules) {
        label("Reglas de negocio");
        body(r.businessRules);
      }
      if (r.dependencies) {
        label("Dependencias");
        body(r.dependencies);
      }
      if (r.assumptions) {
        label("Supuestos y restricciones");
        body(r.assumptions);
      }
      doc.font("Sans-Oblique").fontSize(7.5).fillColor(COLORS.grayText).text(`Versión ${r.version}`).fillColor("black");
      doc.moveDown(0.7);
      divider(doc);
    }
  }

  // --- Historias de usuario --------------------------------------------
  if (stories.length > 0) {
    h1(project.storiesOnly ? "Historia de usuario y criterios de aceptación" : "Historias de usuario y criterios de aceptación");
    for (const r of requirements) {
      const reqStories = storiesByRequirement.get(r.id) ?? [];
      if (reqStories.length === 0) continue;
      if (!project.storiesOnly) h2(`${r.code} — ${r.title}`);
      for (const s of reqStories) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 100) doc.addPage();
        doc.font("Sans-Bold").fontSize(10).fillColor(COLORS.navy).text(`${s.code} — ${s.title}`);
        doc.fillColor("black");
        const rowPills = [];
        if (s.priority) rowPills.push({ text: REQUIREMENT_PRIORITY_LABEL_ES[s.priority], bg: PRIORITY_BG[s.priority] });
        if (s.storyPoints != null) rowPills.push({ text: `${s.storyPoints} pts`, bg: COLORS.grayLight, color: COLORS.navy });
        if (rowPills.length > 0) pillRow(rowPills);
        body(formatUserStorySentence(s.actor, s.goal, s.benefit));
        for (const ac of s.acceptanceCriteria) {
          doc.font("Sans-Bold").fontSize(8.5).fillColor(COLORS.blue600).text(ac.scenarioName).fillColor("black");
          bullet(`DADO ${ac.given}, CUANDO ${ac.when}, ENTONCES ${ac.then}`);
          for (const tc of testCasesByCriterion.get(ac.id) ?? []) {
            bullet(`[${TEST_CASE_TYPE_LABEL_ES[tc.type]}] ${tc.title}`, 1);
          }
        }
        if (s.definitionOfReady) {
          label("Definition of Ready");
          body(s.definitionOfReady);
        }
        if (s.definitionOfDone) {
          label("Definition of Done");
          body(s.definitionOfDone);
        }
        if (s.dependencies) {
          label("Dependencias");
          body(s.dependencies);
        }
        doc.moveDown(0.7);
        divider(doc);
      }
    }
  }

  // --- Modelo de datos ---------------------------------------------------
  if (dataModel.length > 0) {
    h1("Modelo de datos");
    for (const entity of dataModel) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 100) doc.addPage();
      h2(entity.name);
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
        doc
          .font("Mono-Bold")
          .fontSize(9)
          .fillColor(COLORS.navy)
          .text(f.name, { continued: true, lineGap: 3 })
          .font("Sans")
          .fillColor(COLORS.grayText)
          .text(`  ${typeText}${nullText}${keyText}`, { continued: !!f.description, lineGap: 3 });
        if (f.description) {
          doc.fillColor("black").text(`  — ${f.description}`, { lineGap: 3 });
        }
        doc.fillColor("black");
        doc.moveDown(0.15);
      }
      const relations = entity.relations as unknown as { cardinality: string; target: string; description: string }[];
      if (relations.length > 0) {
        doc.moveDown(0.3);
        for (const rel of relations) {
          bullet(
            `${DATA_MODEL_CARDINALITY_LABEL_ES[rel.cardinality] ?? rel.cardinality} → ${rel.target}: ${rel.description}`,
          );
        }
      }
      doc.moveDown(0.8);
    }
  }

  // --- API sugerida --------------------------------------------------------
  if (apiEndpoints.length > 0) {
    h1(`API sugerida (${apiEndpoints.length} endpoints)`);
    const methodBg: Record<string, string> = {
      GET: COLORS.blue400,
      POST: COLORS.green,
      PATCH: COLORS.blue600,
      PUT: COLORS.blue600,
      DELETE: COLORS.red,
    };
    for (const e of apiEndpoints) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
      const y = doc.y;
      const w = pill(doc, e.method, contentLeft, y, { bg: methodBg[e.method] ?? COLORS.navy, fontSize: 7.5 });
      doc
        .font("Mono-Bold")
        .fontSize(8.5)
        .fillColor(COLORS.navy)
        .text(e.path, contentLeft + w + 8, y + 2, { continued: true })
        .font("Sans")
        .fillColor(COLORS.grayText)
        .text(`  ${e.description}`);
      doc.fillColor("black");
      doc.moveDown(0.45);
    }
  }

  // --- Casos de prueba ----------------------------------------------------
  if (testCases.length > 0) {
    h1(`Casos de prueba (${testCases.length})`);
    for (const tc of testCases) {
      if (doc.y > doc.page.height - doc.page.margins.bottom - 100) doc.addPage();
      doc.font("Sans-Bold").fontSize(10).fillColor(COLORS.navy).text(`${tc.code} — ${tc.title}`);
      doc.fillColor("black");
      pillRow([
        { text: TEST_CASE_TYPE_LABEL_ES[tc.type], bg: COLORS.blue600 },
        { text: TEST_CASE_SEVERITY_LABEL_ES[tc.severity], bg: SEVERITY_BG[tc.severity] },
      ]);
      label("Precondición");
      body(tc.precondition);
      label("Pasos");
      (tc.steps as unknown as string[]).forEach((step, i) => bullet(`${i + 1}. ${step}`));
      if (tc.testData) {
        label("Datos de prueba");
        body(tc.testData);
      }
      label("Resultado esperado");
      body(tc.expectedResult);
      doc.font("Sans-Oblique").fontSize(7.5).fillColor(COLORS.grayText).text("Estado: No ejecutado").fillColor("black");
      doc.moveDown(0.7);
      divider(doc);
    }
  }

  // --- Pie de página en todas las hojas ------------------------------------
  // El footer se dibuja a 34pt del borde inferior, dentro del margen de 54pt
  // — fuera del área "imprimible" que pdfkit vigila. Sin poner el margen
  // inferior en 0 antes de escribir, pdfkit interpreta ese .text() como un
  // desbordamiento de página e inserta automáticamente una página nueva en
  // blanco para cada footer, duplicando el documento entero con hojas vacías.
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(i);
    const originalBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("Sans")
      .fontSize(7.5)
      .fillColor(COLORS.grayText)
      .text(`Qubit · ${project.name}`, contentLeft, doc.page.height - 34, { continued: true, lineBreak: false })
      .text(`Página ${i + 1} de ${pageRange.count}`, { align: "right" });
    doc.page.margins.bottom = originalBottomMargin;
  }

  doc.end();
  return done;
}
