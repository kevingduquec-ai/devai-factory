import { dirname, join } from "node:path";
import type PDFDocument from "pdfkit";

/** Paleta de marca Qubit (ver apps/web/src/app/globals.css para la misma paleta en el frontend). */
export const COLORS = {
  navy: "#0A1931",
  blue600: "#195F9F",
  blue400: "#1598D3",
  green: "#59C141",
  grayLight: "#E2E5E4",
  grayText: "#5B6577",
  red: "#B3261E",
  white: "#FFFFFF",
};

const FONTS_DIR = dirname(require.resolve("dejavu-fonts-ttf/package.json"));
export const FONT_PATHS = {
  sans: join(FONTS_DIR, "ttf/DejaVuSans.ttf"),
  sansBold: join(FONTS_DIR, "ttf/DejaVuSans-Bold.ttf"),
  sansOblique: join(FONTS_DIR, "ttf/DejaVuSans-Oblique.ttf"),
  monoBold: join(FONTS_DIR, "ttf/DejaVuSansMono-Bold.ttf"),
};

export const QUBIT_ICON_PATH = join(__dirname, "..", "..", "assets", "qubit-icon.png");

export function registerFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont("Sans", FONT_PATHS.sans);
  doc.registerFont("Sans-Bold", FONT_PATHS.sansBold);
  doc.registerFont("Sans-Oblique", FONT_PATHS.sansOblique);
  doc.registerFont("Mono-Bold", FONT_PATHS.monoBold);
}

/** Dibuja una "píldora" de una sola línea (badge) en la posición actual del cursor y devuelve su ancho. */
export function pill(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  opts: { bg: string; color?: string; fontSize?: number } = { bg: COLORS.navy },
): number {
  const fontSize = opts.fontSize ?? 7.5;
  const color = opts.color ?? COLORS.white;
  const padX = 6;
  const padY = 3;
  doc.font("Sans-Bold").fontSize(fontSize);
  const w = doc.widthOfString(text) + padX * 2;
  const h = fontSize + padY * 2;
  doc.roundedRect(x, y, w, h, h / 2).fill(opts.bg);
  doc.fillColor(color).text(text, x + padX, y + padY, { lineBreak: false });
  doc.fillColor(COLORS.navy);
  return w;
}

/** Línea divisoria delgada en gris claro, en el ancho de contenido actual. */
export function divider(doc: PDFKit.PDFDocument) {
  const y = doc.y;
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .strokeColor(COLORS.grayLight)
    .lineWidth(0.75)
    .stroke();
  doc.moveDown(0.9);
}
