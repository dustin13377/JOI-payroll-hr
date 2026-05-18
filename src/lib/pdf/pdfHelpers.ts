import jsPDF from "jspdf";

// ── Constants ───────────────────────────────────────────────────────
export const MARGIN_LEFT = 0.75;
export const MARGIN_RIGHT = 0.75;
export const MARGIN_TOP = 1.0;
export const MARGIN_BOTTOM = 1.0;
export const PAGE_WIDTH = 8.5;
export const PAGE_HEIGHT = 11;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

export function createDoc(): jsPDF {
  return new jsPDF({ unit: "in", format: "letter" });
}

/** Check if we need a new page; if so, add one and return the new Y. */
export function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_HEIGHT - MARGIN_BOTTOM) {
    doc.addPage();
    return MARGIN_TOP;
  }
  return y;
}

/** Draw right-aligned doc_ref header on the current page. */
export function drawHeader(doc: jsPDF, docRef: string): void {
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.text(docRef, PAGE_WIDTH - MARGIN_RIGHT, 0.6, { align: "right" });
}

/** Draw page footer. Called after all content is placed. */
export function drawFooters(doc: jsPDF, docRef: string): void {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawHeader(doc, docRef);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `P á g i n a ${i} | ${totalPages}`,
      PAGE_WIDTH - MARGIN_RIGHT,
      PAGE_HEIGHT - 0.5,
      { align: "right" },
    );
  }
}

/** Word-wrap text and draw it. Returns the Y position after the text. */
export function drawParagraph(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  opts?: {
    fontSize?: number;
    fontStyle?: string;
    lineHeight?: number;
    align?: "left" | "center" | "right" | "justify";
  },
): number {
  const fontSize = opts?.fontSize ?? 10;
  const fontStyle = opts?.fontStyle ?? "normal";
  const lineHeight = opts?.lineHeight ?? 1.2;
  const align = opts?.align ?? "left";

  doc.setFont("Helvetica", fontStyle);
  doc.setFontSize(fontSize);

  const lines: string[] = doc.splitTextToSize(text, maxWidth);
  const lineSpacing = (fontSize / 72) * lineHeight;

  for (const line of lines) {
    y = ensureSpace(doc, y, lineSpacing);
    doc.text(line, x, y, { align, maxWidth: align === "justify" ? maxWidth : undefined });
    y += lineSpacing;
  }
  return y;
}

/** Draw a simple 2-col label/value table. Returns Y after the table. */
export function drawMetadataTable(
  doc: jsPDF,
  rows: { label: string; value: string }[],
  x: number,
  y: number,
  labelWidth: number,
  totalWidth: number,
): number {
  const rowPadding = 0.08;
  const fontSize = 10;
  doc.setFontSize(fontSize);
  const lineH = (fontSize / 72) * 1.3;

  // Hairline stroke — jsPDF's default in inch mode is ~0.2" which is
  // wider than the cells are tall and fills them entirely black.
  doc.setLineWidth(0.005);
  doc.setDrawColor(0, 0, 0);

  for (const row of rows) {
    // Compute needed height
    doc.setFont("Helvetica", "normal");
    const valueLines: string[] = doc.splitTextToSize(
      row.value,
      totalWidth - labelWidth - rowPadding * 2,
    );
    const cellH = Math.max(lineH * valueLines.length + rowPadding * 2, lineH + rowPadding * 2);

    y = ensureSpace(doc, y, cellH);

    // Label cell (gray background)
    doc.setFillColor(230, 230, 230);
    doc.rect(x, y, labelWidth, cellH, "FD");
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(row.label, x + rowPadding, y + rowPadding + lineH * 0.8);

    // Value cell (stroke only — no fill)
    doc.rect(x + labelWidth, y, totalWidth - labelWidth, cellH, "S");
    doc.setFont("Helvetica", "normal");
    let valY = y + rowPadding + lineH * 0.8;
    for (const line of valueLines) {
      doc.text(line, x + labelWidth + rowPadding, valY);
      valY += lineH;
    }

    y += cellH;
  }
  return y;
}

/** Draw a signature block: line + name + title. Returns Y after. */
export function drawSignatureBlock(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  name?: string,
  opts?: { bold?: boolean },
): number {
  const centerX = x + width / 2;
  y = ensureSpace(doc, y, 0.8);

  // Signature line
  doc.setLineWidth(0.005);
  doc.line(x + 0.2, y, x + width - 0.2, y);
  y += 0.15;

  // Name (if provided)
  if (name) {
    doc.setFont("Helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.text(name, centerX, y, { align: "center" });
    y += 0.15;
  }

  // Title
  doc.setFont("Helvetica", opts?.bold ? "bold" : "normal");
  doc.setFontSize(9);
  doc.text(title, centerX, y, { align: "center" });
  y += 0.25;

  return y;
}
