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

// Alto real de una píldora (ver pill() en pdf-theme.ts: fontSize 7.5 + padY 3 * 2).
const PILL_HEIGHT = 13.5;

export async function buildQaReport(data: QaReportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 54, bufferPages: true });
  registerFonts(doc);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const contentLeft = doc.page.margins.left;
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // pill() deja el font/tamaño activo en "Sans-Bold" 7.5 y nunca lo
  // restaura — un moveDown() justo después se mueve según ESE tamaño
  // (mucho más chico que el del texto que sigue), dejando la próxima línea
  // demasiado cerca y superpuesta con la píldora. Por eso aquí siempre se
  // fija doc.y a un valor absoluto (alto real de la píldora + separación)
  // en vez de moveDown, y se restaura el font de inmediato.
  function drawStatusPill(text: string, bg: string) {
    const y = doc.y;
    pill(doc, text, contentLeft, y, { bg });
    doc.font("Sans").fontSize(9.5).fillColor("black");
    doc.y = y + PILL_HEIGHT + 8;
    doc.x = contentLeft;
  }

  function ensureSpace(neededHeight: number) {
    if (doc.y + neededHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  }

  const h2 = (text: string) => {
    doc.moveDown(0.8);
    ensureSpace(doc.heightOfString(text, { width: contentWidth }) + 40);
    doc.fillColor(COLORS.blue600).font("Sans-Bold").fontSize(12).text(text, { width: contentWidth }).fillColor("black").moveDown(0.25);
  };
  const label = (text: string) =>
    doc.moveDown(0.3).font("Sans-Bold").fontSize(8.5).fillColor(COLORS.grayText).text(text.toUpperCase()).moveDown(0.08);
  const body = (text: string) => {
    doc.font("Sans").fontSize(9.5).fillColor("black");
    ensureSpace(doc.heightOfString(text, { width: contentWidth, lineGap: 2 }) + 20);
    doc.text(text, { width: contentWidth, lineGap: 2 });
  };
  const numbered = (items: string[]) => {
    doc.font("Sans").fontSize(9).fillColor("black");
    for (const [i, t] of items.entries()) {
      const line = `${i + 1}. ${t}`;
      ensureSpace(doc.heightOfString(line, { width: contentWidth - 10, lineGap: 1.5 }) + 6);
      doc.text(line, { indent: 10, width: contentWidth, lineGap: 1.5 });
    }
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
  drawStatusPill(`${data.cases.filter((c) => c.status === "passed").length} de ${data.cases.length} casos pasaron`, STATUS_BG[data.status] ?? COLORS.grayText);
  doc.moveDown(0.7);
  divider(doc);

  // --- Un bloque por caso --------------------------------------------
  for (const c of data.cases) {
    // Antes de empezar un caso nuevo, si no queda espacio razonable para al
    // menos su título y su píldora de estado, se pasa de página — así el
    // encabezado del caso nunca queda solo al fondo de una página con el
    // resto del bloque empezando en la siguiente.
    ensureSpace(120);

    h2(`${c.code} — ${c.title}`);
    doc.moveDown(0.1);
    drawStatusPill(STATUS_LABEL[c.status] ?? c.status, STATUS_BG[c.status] ?? COLORS.grayText);

    label("Resultado esperado");
    body(c.expectedResult);

    if (c.errorMessage) {
      label("Detalle del fallo");
      doc.font("Sans").fontSize(9.5).fillColor(COLORS.red);
      ensureSpace(doc.heightOfString(c.errorMessage, { width: contentWidth, lineGap: 2 }) + 20);
      doc.text(c.errorMessage, { width: contentWidth, lineGap: 2 }).fillColor("black");
    }

    label("Pasos ejecutados");
    numbered(c.steps.map((s) => s.description));

    if (c.screenshotFiles.length > 0) {
      label("Evidencia");
      // Antes: 150pt de ancho, hasta 4 por fila y tope de 4 capturas —
      // demasiado chico para leer un mensaje de error o el estado real de
      // la pantalla, y sin forma de saber a qué paso correspondía cada
      // una. Ahora: 2 por fila a todo lo ancho disponible (misma
      // proporción 1280x800 del viewport real capturado, así no se
      // distorsiona), con el número de paso como pie de foto, y se
      // muestran TODAS las capturas del caso, no solo las primeras 4.
      const gap = 14;
      const perRow = 2;
      const imgWidth = (contentWidth - gap * (perRow - 1)) / perRow;
      const imgHeight = imgWidth * (800 / 1280);
      const captionHeight = 14;
      const rowHeight = imgHeight + captionHeight;

      const validFiles = c.screenshotFiles
        .map((file, stepIndex) => ({ file, stepIndex }))
        .filter(({ file }) => existsSync(join(data.evidenceDir, file)));

      for (let i = 0; i < validFiles.length; i += perRow) {
        ensureSpace(rowHeight + 10);
        const rowY = doc.y;
        const rowItems = validFiles.slice(i, i + perRow);
        rowItems.forEach(({ file, stepIndex }, col) => {
          const x = contentLeft + col * (imgWidth + gap);
          try {
            doc.image(join(data.evidenceDir, file), x, rowY, { width: imgWidth });
          } catch {
            // captura corrupta o ilegible — se omite sin interrumpir el reporte
          }
          doc
            .font("Sans")
            .fontSize(7.5)
            .fillColor(COLORS.grayText)
            .text(`Paso ${stepIndex + 1}`, x, rowY + imgHeight + 2, { width: imgWidth, align: "center" })
            .fillColor("black");
        });
        doc.y = rowY + rowHeight;
      }
      doc.x = contentLeft;
    }

    doc.moveDown(0.5);
    divider(doc);
  }

  doc.end();
  return done;
}
