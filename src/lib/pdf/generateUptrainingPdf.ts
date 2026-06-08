// Constancia de Uptraining / Capacitación Continua — light-fill printable form.
//
// Option #2 of the uptraining build: the app auto-populates the agent identity
// header (full LEGAL names per JOI policy) and the KPI-minimums table (pulled
// from campaign_kpi_config). Everything else — session rows, topic checkboxes,
// commitments, observations, signatures — is left blank for the coach/TL to
// fill by hand on the printed copy. No DB row, no draft flow; generated
// client-side and opened in a new tab.
//
// All personal names rendered here are full legal names (agent + supervisor +
// legal rep). Work/display names are never used on HR documents.

import jsPDF from "jspdf";
import {
  UPTRAINING_TITLE,
  UPTRAINING_SUBTITLE,
  UPTRAINING_TOPICS,
  UPTRAINING_SESSION_HEADERS,
  UPTRAINING_KPI_HEADERS,
  UPTRAINING_FIRMAS_INTRO,
  UPTRAINING_FOOTER,
  UPTRAINING_LEGAL_REP_NAME,
  UPTRAINING_LEGAL_REP_TITLE,
} from "@/lib/documentTemplates";
import {
  createDoc,
  drawParagraph,
  drawSignatureBlock,
  ensureSpace,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_BOTTOM,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN_TOP,
  CONTENT_WIDTH,
} from "./pdfHelpers";

export interface UptrainingKpiRow {
  /** KPI label, e.g. "Llamadas diarias" */
  label: string;
  /** Minimum required, e.g. "350" */
  min: string;
}

export interface UptrainingSeed {
  /** Full LEGAL name, uppercased. */
  agentLegalName: string;
  puesto: string;
  campaign: string;
  /** Formatted hire date (long form) or "". */
  hireDateLong: string;
  /** Supervisor / Team Lead full LEGAL name. */
  supervisorLegalName: string;
  companyLegalName: string;
  /** Today, long form. */
  elaboracionDateLong: string;
  /** KPI minimums from campaign_kpi_config. May be empty. */
  kpiRows: UptrainingKpiRow[];
}

const HAIRLINE = 0.005;

/** Draw a section heading bar. Returns Y after. */
function drawHeading(doc: jsPDF, label: string, y: number): number {
  y = ensureSpace(doc, y, 0.45);
  doc.setFillColor(235, 235, 235);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(HAIRLINE);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, 0.26, "FD");
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(label, MARGIN_LEFT + 0.08, y + 0.175);
  return y + 0.26 + 0.12;
}

/** A "Label: ____" fill-in line. Returns Y after. */
function drawFillLine(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
): number {
  const lineH = 0.28;
  y = ensureSpace(doc, y, lineH);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(label, MARGIN_LEFT, y);
  const labelW = doc.getTextWidth(label) + 0.1;
  const lineStart = MARGIN_LEFT + labelW;
  const lineEnd = PAGE_WIDTH - MARGIN_RIGHT;
  // Auto-filled value sits on top of the underline.
  if (value) {
    doc.setFont("Helvetica", "normal");
    doc.text(value, lineStart + 0.04, y - 0.01);
  }
  doc.setLineWidth(HAIRLINE);
  doc.line(lineStart, y + 0.04, lineEnd, y + 0.04);
  return y + lineH;
}

/** Generic bordered table. `rows` cells: "" renders blank. Returns Y after. */
function drawTable(
  doc: jsPDF,
  headers: string[],
  colWidths: number[],
  rows: string[][],
  y: number,
  opts?: { rowHeight?: number; fontSize?: number },
): number {
  const rowH = opts?.rowHeight ?? 0.34;
  const headH = 0.3;
  const fontSize = opts?.fontSize ?? 8.5;
  const x0 = MARGIN_LEFT;

  // Header row
  y = ensureSpace(doc, y, headH + rowH);
  doc.setLineWidth(HAIRLINE);
  doc.setDrawColor(0, 0, 0);
  let cx = x0;
  for (let c = 0; c < headers.length; c++) {
    // Re-set the fill before every cell: jsPDF's text() leaves the PDF fill
    // color set to the last text color (black), so a subsequent filled rect
    // would come out black. Setting gray here keeps every header cell gray.
    doc.setFillColor(225, 225, 225);
    doc.rect(cx, y, colWidths[c], headH, "FD");
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(fontSize);
    doc.setTextColor(0, 0, 0);
    const lines: string[] = doc.splitTextToSize(headers[c], colWidths[c] - 0.08);
    let ty = y + 0.13;
    for (const ln of lines) {
      doc.text(ln, cx + 0.04, ty);
      ty += 0.1;
    }
    cx += colWidths[c];
  }
  y += headH;

  // Body rows
  doc.setFont("Helvetica", "normal");
  for (const row of rows) {
    y = ensureSpace(doc, y, rowH);
    cx = x0;
    for (let c = 0; c < headers.length; c++) {
      doc.rect(cx, y, colWidths[c], rowH, "S");
      const cell = row[c] ?? "";
      if (cell) {
        doc.setFontSize(fontSize);
        const lines: string[] = doc.splitTextToSize(cell, colWidths[c] - 0.08);
        let ty = y + 0.15;
        for (const ln of lines) {
          doc.text(ln, cx + 0.04, ty);
          ty += 0.11;
        }
      }
      cx += colWidths[c];
    }
    y += rowH;
  }
  return y;
}

/** Two-column checkbox list. Returns Y after. */
function drawCheckboxList(doc: jsPDF, items: string[], y: number): number {
  const colGap = 0.25;
  const colW = (CONTENT_WIDTH - colGap) / 2;
  const boxSize = 0.1;
  const rowH = 0.24;
  const fontSize = 8.5;
  const half = Math.ceil(items.length / 2);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(fontSize);
  doc.setLineWidth(HAIRLINE);
  doc.setDrawColor(0, 0, 0);

  const startY = y;
  for (let i = 0; i < items.length; i++) {
    const col = i < half ? 0 : 1;
    const rowIdx = i < half ? i : i - half;
    const colX = MARGIN_LEFT + col * (colW + colGap);
    let rowY = startY + rowIdx * rowH;

    // Paginate if the left column overflows (both columns share row math, so
    // only check on the first column to keep them aligned).
    if (col === 0 && rowY + rowH > PAGE_HEIGHT - MARGIN_BOTTOM) {
      // Not expected for 19 items on a fresh section, but guard anyway.
      doc.addPage();
      return drawCheckboxList(doc, items, MARGIN_TOP);
    }

    doc.rect(colX, rowY - boxSize + 0.02, boxSize, boxSize, "S");
    const textLines: string[] = doc.splitTextToSize(
      items[i],
      colW - boxSize - 0.1,
    );
    let ty = rowY;
    for (const ln of textLines) {
      doc.text(ln, colX + boxSize + 0.08, ty);
      ty += 0.11;
    }
  }
  return startY + half * rowH + 0.05;
}

/** N blank ruled lines for handwriting. Returns Y after. */
function drawBlankLines(
  doc: jsPDF,
  count: number,
  y: number,
  opts?: { numbered?: boolean },
): number {
  const lineH = 0.32;
  doc.setLineWidth(HAIRLINE);
  doc.setDrawColor(0, 0, 0);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9.5);
  for (let i = 0; i < count; i++) {
    y = ensureSpace(doc, y, lineH);
    let lineStart = MARGIN_LEFT;
    if (opts?.numbered) {
      doc.text(`${i + 1}.`, MARGIN_LEFT, y + 0.04);
      lineStart = MARGIN_LEFT + 0.3;
    }
    doc.line(lineStart, y + 0.08, PAGE_WIDTH - MARGIN_RIGHT, y + 0.08);
    y += lineH;
  }
  return y;
}

export function generateUptrainingPdf(seed: UptrainingSeed): Blob {
  const doc = createDoc();
  let y = MARGIN_TOP;

  // ── Title block ────────────────────────────────────────────────────
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(seed.companyLegalName, PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.18;
  doc.setFontSize(8.5);
  doc.setFont("Helvetica", "normal");
  doc.text("Guadalajara, Jalisco, México", PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.28;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(12);
  doc.text(UPTRAINING_TITLE, PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.2;
  doc.setFont("Helvetica", "italic");
  doc.setFontSize(8.5);
  y = drawParagraph(doc, UPTRAINING_SUBTITLE, MARGIN_LEFT, y, CONTENT_WIDTH, {
    fontSize: 8.5,
    fontStyle: "italic",
    align: "center",
  });
  y += 0.1;

  // Fecha de elaboración (auto-filled with today, still editable on paper)
  y = drawFillLine(doc, "Fecha de elaboración:", seed.elaboracionDateLong, y);
  y += 0.1;

  // ── I. Datos del agente (auto-filled) ──────────────────────────────
  y = drawHeading(doc, "I.   DATOS DEL AGENTE", y);
  y = drawFillLine(doc, "Nombre completo:", seed.agentLegalName, y);
  y = drawFillLine(doc, "Puesto:", seed.puesto, y);
  y = drawFillLine(doc, "Campaña asignada:", seed.campaign, y);
  y = drawFillLine(doc, "Fecha de ingreso:", seed.hireDateLong, y);
  y = drawFillLine(doc, "Supervisor / Team Lead:", seed.supervisorLegalName, y);
  y = drawFillLine(doc, "Motivo del uptraining:", "", y);
  y += 0.18;

  // ── II. Registro de sesiones (blank) ───────────────────────────────
  y = drawHeading(doc, "II.   REGISTRO DE SESIONES DE CAPACITACIÓN", y);
  y = drawParagraph(
    doc,
    "Complete una fila por cada sesión o día de uptraining realizado.",
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
    { fontSize: 8.5, fontStyle: "italic" },
  );
  y += 0.06;
  const sessionWidths = [0.4, 1.2, 1.2, 1.8, 1.0, 1.4];
  const sessionRows: string[][] = [1, 2, 3, 4].map((n) => [
    String(n),
    "",
    "",
    "",
    "",
    "",
  ]);
  y = drawTable(doc, UPTRAINING_SESSION_HEADERS, sessionWidths, sessionRows, y, {
    rowHeight: 0.34,
  });
  y += 0.1;
  y = drawFillLine(doc, "Período total del uptraining:   del", "", y);
  y = drawFillLine(doc, "Total de sesiones:", "", y);
  y = drawFillLine(doc, "Total de horas:", "", y);
  y += 0.18;

  // ── III. Temas abordados (checkboxes, blank) ───────────────────────
  y = drawHeading(doc, "III.   TEMAS ABORDADOS EN EL UPTRAINING", y);
  y = drawParagraph(
    doc,
    "A.  Temas predefinidos — marque todos los que apliquen:",
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
    { fontSize: 9, fontStyle: "bold" },
  );
  y += 0.08;
  y = drawCheckboxList(doc, UPTRAINING_TOPICS, y);
  y += 0.08;
  y = drawParagraph(
    doc,
    "B.  Temas adicionales o específicos de la sesión:",
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
    { fontSize: 9, fontStyle: "bold" },
  );
  y += 0.06;
  y = drawBlankLines(doc, 3, y, { numbered: true });
  y += 0.16;

  // ── IV. Métricas que originaron el uptraining (KPI minimums filled) ─
  y = drawHeading(doc, "IV.   MÉTRICAS QUE ORIGINARON EL UPTRAINING", y);
  y = drawParagraph(
    doc,
    "Indicadores con bajo desempeño que motivaron esta sesión de reforzamiento. Los mínimos requeridos provienen de la configuración de la campaña; complete el promedio del agente y la meta a mano.",
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
    { fontSize: 8.5, fontStyle: "italic" },
  );
  y += 0.06;
  const kpiWidths = [2.2, 1.4, 1.4, 1.4, 0.6];
  // Use campaign KPI minimums when available; otherwise a few blank rows.
  const kpiRows: string[][] =
    seed.kpiRows.length > 0
      ? seed.kpiRows.map((r) => [r.label, r.min, "", "", ""])
      : [
          ["", "", "", "", ""],
          ["", "", "", "", ""],
          ["", "", "", "", ""],
          ["", "", "", "", ""],
        ];
  y = drawTable(doc, UPTRAINING_KPI_HEADERS, kpiWidths, kpiRows, y, {
    rowHeight: 0.36,
  });
  y += 0.18;

  // ── V. Compromisos y plan de seguimiento (blank) ───────────────────
  y = drawHeading(doc, "V.   COMPROMISOS Y PLAN DE SEGUIMIENTO", y);
  y = drawParagraph(
    doc,
    "Compromisos adquiridos por el agente al término del uptraining:",
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
    { fontSize: 9 },
  );
  y += 0.06;
  y = drawBlankLines(doc, 4, y, { numbered: true });
  y += 0.06;
  y = drawFillLine(doc, "Fecha de revisión de resultados:", "", y);
  y = drawFillLine(doc, "Responsable del seguimiento:", "", y);
  y += 0.16;

  // ── VI. Observaciones generales (blank) ────────────────────────────
  y = drawHeading(doc, "VI.   OBSERVACIONES GENERALES", y);
  y = drawBlankLines(doc, 4, y);
  y += 0.2;

  // ── VII. Firmas de conformidad ─────────────────────────────────────
  y = drawHeading(doc, "VII.   FIRMAS DE CONFORMIDAD", y);
  y = drawParagraph(doc, UPTRAINING_FIRMAS_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH, {
    fontSize: 8.5,
  });
  y += 0.4;

  const colW = CONTENT_WIDTH / 2 - 0.1;
  const leftX = MARGIN_LEFT;
  const rightX = MARGIN_LEFT + colW + 0.2;

  // Row 1: Agente (left) · Instructor/Coach (right)
  y = ensureSpace(doc, y, 1.6);
  const sigY1 = y;
  drawSignatureBlock(
    doc,
    leftX,
    sigY1,
    colW,
    "Agente  ·  Firma de recibido",
    seed.agentLegalName,
  );
  y = drawSignatureBlock(
    doc,
    rightX,
    sigY1,
    colW,
    "Instructor / Coach  ·  Firma",
  );
  y += 0.4;

  // Row 2: Supervisor/TL (left) · Representante legal (right)
  const sigY2 = ensureSpace(doc, y, 0.9);
  drawSignatureBlock(
    doc,
    leftX,
    sigY2,
    colW,
    "Supervisor / Team Lead  ·  Firma",
    seed.supervisorLegalName,
  );
  y = drawSignatureBlock(
    doc,
    rightX,
    sigY2,
    colW,
    UPTRAINING_LEGAL_REP_TITLE,
    UPTRAINING_LEGAL_REP_NAME,
    { bold: true },
  );

  // ── Footer note on every page ──────────────────────────────────────
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(UPTRAINING_FOOTER, PAGE_WIDTH / 2, PAGE_HEIGHT - 0.5, {
      align: "center",
    });
    doc.text(
      `Página ${i} | ${totalPages}`,
      PAGE_WIDTH - MARGIN_RIGHT,
      PAGE_HEIGHT - 0.35,
      { align: "right" },
    );
  }

  return doc.output("blob");
}
