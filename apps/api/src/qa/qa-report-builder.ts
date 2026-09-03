import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { COLORS, divider, pill, registerFonts } from "../export/pdf-theme";

export interface QaReportCase {
  code: string;
  title: string;
  expectedResult: string;
  status: "passed" | "failed" | "error";
  errorMessage?: string | null;
  steps: { description: string }[];
  screenshotFiles: string[];
}

export interface QaReportData {
  moduleName: string;
  targetUrl: string;
  runId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: "passed" | "failed" | "error";
  cases: QaReportCase[];
  evidenceDir: string;
}

const STATUS_LABEL: Record<string, string> = { passed: "Pasó", failed: "Falló", error: "Error" };
const STATUS_BG: Record<string, string> = { passed: COLORS.green, failed: COLORS.red, error: COLORS.grayText };

export async function buildQaReport(data: QaReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 54, bufferPages: true });
  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const contentLeft = doc.page.margins.left;

  const h2 = (text: string) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 120) doc.addPage();
    doc.moveDown(0.8).fillColor(COLORS.blue600).font("Sans-Bold").fontSize(12).text(text).fillColor("black").moveDown(0.25);
  };
  const label = (text: string) =>
    doc.moveDown(0.3).font("Sans-Bold").fontSize(8.5).fillColor(COLORS.grayText).text(text.toUpperCase()).moveDown(0.08);
  const body = (text: string) =>
    doc.font("Sans").fontSize(9.5).fillColor("black").text(text, { lineGap: 2 });
  const numbered = (items: string[]) => {
    doc.font("Sans").fontSize(9).fillColor("black");
    items.forEach((t, i) => doc.text(`${i + 1}. ${t}`, { indent: 10, lineGap: 1.5 }));
  };

  // --- Portada -----------------------------------------------------
  doc.rect(0, 0, doc.page.width, 120).fill(COLORS.navy);
  doc.fillColor(COLORS.white).font("Sans-Bold").fontSize(20).text("Reporte de pruebas QA-AI", contentLeft, 40);
  doc.font("Sans").fontSize(11).text(data.moduleName, contentLeft, 70);
  doc.fillColor("black").moveDown(3);

  label("URL probada");
  body(data.targetUrl);
  label("Corrida");
  body(`${data.runId} — iniciada ${data.startedAt.toLocaleString("es-CO")}${data.finishedAt ? `, finalizada ${data.finishedAt.toLocaleString("es-CO")}` : ""}`);
  label("Resultado general");
  doc.moveDown(0.2);
  pill(doc, `${data.cases.filter((c) => c.status === "passed").length} de ${data.cases.length} casos pasaron`, contentLeft, doc.y, {
    bg: STATUS_BG[data.status] ?? COLORS.grayText,
  });
  doc.moveDown(1.5);
  doc.x = contentLeft;
  divider(doc);

  // --- Un bloque por caso --------------------------------------------
  for (const c of data.cases) {
    h2(`${c.code} — ${c.title}`);
    doc.moveDown(0.1);
    pill(doc, STATUS_LABEL[c.status] ?? c.status, contentLeft, doc.y, { bg: STATUS_BG[c.status] ?? COLORS.grayText });
    doc.moveDown(1.1);
    doc.x = contentLeft;

    label("Resultado esperado");
    body(c.expectedResult);

    if (c.errorMessage) {
      label("Detalle del fallo");
      doc.font("Sans").fontSize(9.5).fillColor(COLORS.red).text(c.errorMessage, { lineGap: 2 }).fillColor("black");
    }

    label("Pasos ejecutados");
    numbered(c.steps.map((s) => s.description));

    if (c.screenshotFiles.length > 0) {
      label("Evidencia");
      const thumbWidth = 150;
      let x = contentLeft;
      const rowY = doc.y;
      for (const file of c.screenshotFiles.slice(0, 4)) {
        const filePath = join(data.evidenceDir, file);
        if (!existsSync(filePath)) continue;
        if (x + thumbWidth > doc.page.width - doc.page.margins.right) {
          x = contentLeft;
          doc.y += 116;
        }
        try {
          doc.image(filePath, x, doc.y, { width: thumbWidth });
        } catch {
          // captura corrupta o ilegible — se omite sin interrumpir el reporte
        }
        x += thumbWidth + 10;
      }
      doc.y = rowY + 120;
      doc.x = contentLeft;
    }

    doc.moveDown(0.5);
    divider(doc);
  }

  doc.end();
  return done;
}
