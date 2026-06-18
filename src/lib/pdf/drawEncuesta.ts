// Shared "Encuesta de Salida" (exit survey) renderer.
//
// This is the same survey that ships on the voluntary-resignation packet.
// It is appended to involuntary-termination documents as well so that every
// baja — quit OR termination — collects the same exit feedback. The survey is
// pen-fillable (Likert grid, open questions, causa de baja checkboxes) and is
// signed by the trabajador.
//
// Single source of truth: edit the survey HERE, not in the generators.

import type jsPDF from "jspdf";
import {
  ENCUESTA_INTRO,
  ENCUESTA_CATEGORIES,
  ENCUESTA_OPEN_QUESTIONS,
  ENCUESTA_CAUSA_OPTIONS,
} from "@/lib/documentTemplates";
import {
  drawParagraph,
  drawSignatureBlock,
  ensureSpace,
  MARGIN_LEFT,
  MARGIN_TOP,
  PAGE_WIDTH,
  CONTENT_WIDTH,
} from "./pdfHelpers";

/**
 * Render the Encuesta de Salida on a fresh page (or pages — it paginates
 * itself via ensureSpace). Starts by adding a new page, so call it after the
 * preceding content is fully placed. Returns the Y position after the survey.
 */
export function drawEncuestaDeSalida(
  doc: jsPDF,
  opts: { trabajador: string; puesto: string; fechaLong: string },
): number {
  const { trabajador, puesto, fechaLong } = opts;

  doc.addPage();
  let y = MARGIN_TOP;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(12);
  doc.text("ENCUESTA DE SALIDA", PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.3;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`FECHA: ${fechaLong}`, MARGIN_LEFT, y);
  y += 0.17;
  doc.text(`NOMBRE: ${trabajador}`, MARGIN_LEFT, y);
  y += 0.17;
  doc.text(`PUESTO: ${puesto}`, MARGIN_LEFT, y);
  y += 0.25;

  y = drawParagraph(doc, ENCUESTA_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH, { fontSize: 9 });
  y += 0.15;

  // Likert table
  const likertHeaders = ["MUY\nSATISFECHO", "SATISFECHO", "NEUTRAL", "INSATISFECHO", "MUY\nINSATISFECHO"];
  const qColW = CONTENT_WIDTH * 0.40;
  const optColW = (CONTENT_WIDTH - qColW) / 5;
  const rowH = 0.25;
  const headerRowH = 0.4;

  // Header row
  y = ensureSpace(doc, y, headerRowH);
  doc.setFillColor(220, 220, 220);
  doc.rect(MARGIN_LEFT, y, qColW, headerRowH, "FD");
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(5);
  for (let i = 0; i < 5; i++) {
    const cx = MARGIN_LEFT + qColW + optColW * i;
    doc.rect(cx, y, optColW, headerRowH, "FD");
    const lines = likertHeaders[i].split("\n");
    const lineH = 0.08;
    const startY = y + (headerRowH - lines.length * lineH) / 2 + lineH;
    for (let j = 0; j < lines.length; j++) {
      doc.text(lines[j], cx + optColW / 2, startY + j * lineH, { align: "center" });
    }
  }
  y += headerRowH;

  // Categories + questions
  for (const cat of ENCUESTA_CATEGORIES) {
    // Category header
    y = ensureSpace(doc, y, rowH + rowH * cat.questions.length);
    doc.setFillColor(240, 240, 240);
    doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, rowH, "FD");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(8);
    doc.text(cat.title, MARGIN_LEFT + 0.08, y + 0.17);
    y += rowH;

    // Questions
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    for (const q of cat.questions) {
      y = ensureSpace(doc, y, rowH);
      doc.rect(MARGIN_LEFT, y, qColW, rowH);
      doc.text(q, MARGIN_LEFT + 0.08, y + 0.17);
      for (let i = 0; i < 5; i++) {
        const cx = MARGIN_LEFT + qColW + optColW * i;
        doc.rect(cx, y, optColW, rowH);
      }
      y += rowH;
    }
  }

  y += 0.2;

  // Open questions
  y = ensureSpace(doc, y, 0.5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Preguntas abiertas", MARGIN_LEFT, y);
  y += 0.2;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  for (const q of ENCUESTA_OPEN_QUESTIONS) {
    y = ensureSpace(doc, y, 0.5);
    doc.text(q, MARGIN_LEFT, y);
    y += 0.2;
    // Two blank lines for pen-fill
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN_LEFT, y, MARGIN_LEFT + CONTENT_WIDTH, y);
    y += 0.2;
    doc.line(MARGIN_LEFT, y, MARGIN_LEFT + CONTENT_WIDTH, y);
    doc.setDrawColor(0, 0, 0);
    y += 0.25;
  }

  // Causa de baja
  y = ensureSpace(doc, y, 1.5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Causa principal de baja:", MARGIN_LEFT, y);
  y += 0.25;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  const causaColW = CONTENT_WIDTH / 2;
  for (let i = 0; i < ENCUESTA_CAUSA_OPTIONS.length; i++) {
    const col = i % 2;
    if (col === 0) y = ensureSpace(doc, y, 0.22);
    const cx = MARGIN_LEFT + col * causaColW;
    // Checkbox
    doc.rect(cx, y - 0.1, 0.12, 0.12);
    doc.text(ENCUESTA_CAUSA_OPTIONS[i], cx + 0.18, y);
    if (col === 1 || i === ENCUESTA_CAUSA_OPTIONS.length - 1) y += 0.22;
  }

  y += 0.3;

  // Signature line
  y = ensureSpace(doc, y, 0.6);
  y = drawSignatureBlock(doc, MARGIN_LEFT + CONTENT_WIDTH / 4, y, CONTENT_WIDTH / 2, "", trabajador, { bold: true });

  return y;
}
