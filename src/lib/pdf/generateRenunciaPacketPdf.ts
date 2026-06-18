import type { FinalizationDraft, HrDocumentRequestQueueItem } from "@/hooks/useHrDocumentRequests";
import { formatDateSpanishFull, formatDateSpanishMedium } from "@/lib/localDate";
import {
  RENUNCIA_OPENING,
  RENUNCIA_CLOSING,
  FINIQUITO_BODY_TEMPLATE,
  FINIQUITO_LEGAL_BOILERPLATE,
  renderTemplate,
} from "@/lib/documentTemplates";
import {
  createDoc,
  drawParagraph,
  drawMetadataTable,
  drawSignatureBlock,
  ensureSpace,
  MARGIN_LEFT,
  PAGE_WIDTH,
  MARGIN_TOP,
  CONTENT_WIDTH,
} from "./pdfHelpers";
import { drawEncuestaDeSalida } from "./drawEncuesta";

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "$ 0.00";
  return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MASKED_MONEY = "$ * * * *";
const MASKED_TEXT = "* * * * * * * * * *";

export function generateRenunciaPacketPdf(
  draft: FinalizationDraft,
  request: HrDocumentRequestQueueItem,
  opts?: { maskSalary?: boolean },
): Blob {
  const mask = opts?.maskSalary === true;
  const money = (n: number | null | undefined): string =>
    mask ? MASKED_MONEY : fmtMoney(n);
  const letras = (s: string | null | undefined): string =>
    mask ? MASKED_TEXT : (s ?? "");
  const doc = createDoc();
  const effectiveDate = draft.effectiveDate ?? draft.incidentDate;
  const effectiveDateLong = formatDateSpanishFull(effectiveDate);
  const trabajador = draft.trabajadorNameSnapshot ?? "";
  const puesto = draft.puestoSnapshot ?? "";

  // ── Page 1: Renuncia letter ─────────────────────────────────────
  let y = MARGIN_TOP;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `Guadalajara, Jalisco, a ${effectiveDateLong}`,
    PAGE_WIDTH - 0.75,
    y,
    { align: "right" },
  );
  y += 0.4;

  doc.setFont("Helvetica", "bold");
  doc.text("OUTSOURCE CONSULTING GROUP SAS:", MARGIN_LEFT, y);
  y += 0.4;

  const renunciaVars = {
    puesto: puesto.toUpperCase(),
    effective_date: effectiveDateLong,
  };
  y = drawParagraph(
    doc,
    renderTemplate(RENUNCIA_OPENING, renunciaVars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.2;

  y = drawParagraph(doc, RENUNCIA_CLOSING, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.4;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ATENTAMENTE", MARGIN_LEFT, y);
  y += 0.5;

  y = drawSignatureBlock(
    doc,
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH / 2,
    "",
  );

  // ── Page 2: Finiquito ──────────────────────────────────────────
  doc.addPage();
  y = MARGIN_TOP;

  doc.setFont("Helvetica", "bolditalic");
  doc.setFontSize(11);
  doc.text("FINIQUITO", MARGIN_LEFT, y);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `Guadalajara, Jalisco, ${effectiveDateLong}`,
    PAGE_WIDTH - 0.75,
    y,
    { align: "right" },
  );
  y += 0.3;

  // Metadata table
  const hireDateFormatted = draft.hireDateSnapshot
    ? formatDateSpanishMedium(draft.hireDateSnapshot)
    : "";
  y = drawMetadataTable(
    doc,
    [
      { label: "Nombre del trabajador:", value: trabajador },
      { label: "Fecha de ingreso:", value: hireDateFormatted },
      { label: "Fecha de renuncia:", value: effectiveDateLong },
      { label: "Puesto desempeñado:", value: puesto.toUpperCase() },
      { label: "Horario de Trabajo:", value: draft.horarioSnapshot ?? "" },
      { label: "Salario Diario:", value: money(draft.salarioDiarioSnapshot) },
    ],
    MARGIN_LEFT,
    y,
    1.7,
    CONTENT_WIDTH,
  );
  y += 0.2;

  // Finiquito body paragraph
  const finVars = {
    total_monto: money(draft.totalMonto),
    total_en_letras: letras(draft.totalEnLetras),
    effective_date: effectiveDateLong,
  };
  y = drawParagraph(
    doc,
    renderTemplate(FINIQUITO_BODY_TEMPLATE, finVars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.2;

  // Itemized table
  const items = [
    { label: "Aguinaldo proporcional", value: money(draft.aguinaldoMonto) },
    { label: "Vacaciones correspondientes", value: money(draft.vacacionesMonto) },
    { label: "Prima vacacional (25%)", value: money(draft.primaVacacionalMonto) },
    { label: "Salarios Devengados de Días", value: money(draft.salariosDevengadosMonto) },
  ];
  y = drawMetadataTable(doc, items.map((i) => ({ label: i.label, value: i.value })), MARGIN_LEFT, y, 2.5, CONTENT_WIDTH);

  // Total row (bold)
  const totalRowH = 0.3;
  y = ensureSpace(doc, y, totalRowH);
  doc.setFillColor(230, 230, 230);
  doc.rect(MARGIN_LEFT, y, 2.5, totalRowH, "FD");
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total", MARGIN_LEFT + 0.08, y + 0.2);
  doc.rect(MARGIN_LEFT + 2.5, y, CONTENT_WIDTH - 2.5, totalRowH);
  doc.text(money(draft.totalMonto), MARGIN_LEFT + 2.58, y + 0.2);
  y += totalRowH;

  // Importe con letra row
  const letraRowH = 0.3;
  doc.rect(MARGIN_LEFT, y, 2.5, letraRowH);
  doc.setFont("Helvetica", "normal");
  doc.text("Importe con letra", MARGIN_LEFT + 0.08, y + 0.2);
  doc.rect(MARGIN_LEFT + 2.5, y, CONTENT_WIDTH - 2.5, letraRowH);
  doc.setFontSize(8);
  const letraText = letras(draft.totalEnLetras);
  const letraLines = doc.splitTextToSize(letraText, CONTENT_WIDTH - 2.5 - 0.16);
  doc.text(letraLines[0] ?? "", MARGIN_LEFT + 2.58, y + 0.2);
  y += letraRowH + 0.2;

  doc.setFontSize(10);

  // Legal boilerplate
  y = drawParagraph(doc, FINIQUITO_LEGAL_BOILERPLATE, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.3;

  // Signature
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Firma de conformidad:", MARGIN_LEFT, y);
  y += 0.4;
  y = drawSignatureBlock(doc, MARGIN_LEFT, y, CONTENT_WIDTH / 2, "");
  y += 0.1;

  // Identity info + fingerprint boxes (same vertical zone, left + right)
  const idY = y;
  doc.setFont("Helvetica", "italic");
  doc.setFontSize(9);
  doc.text(`CLAVE DE ELECTOR: ${draft.claveElector ?? ""}`, MARGIN_LEFT, y);
  y += 0.15;
  doc.text(`CURP: ${draft.curpSnapshot ?? ""}`, MARGIN_LEFT, y);
  y += 0.15;
  doc.text(`RFC: ${draft.rfcSnapshot ?? ""}`, MARGIN_LEFT, y);
  y += 0.3;

  // Fingerprint boxes — right-aligned on same Y as identity block
  const boxSize = 0.7;
  const boxX1 = PAGE_WIDTH - 0.75 - boxSize * 2 - 0.3;
  const boxX2 = PAGE_WIDTH - 0.75 - boxSize;
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(7);
  doc.rect(boxX1, idY, boxSize, boxSize);
  doc.text("Huella Digital izquierda", boxX1, idY + boxSize + 0.1, { align: "left" });
  doc.rect(boxX2, idY, boxSize, boxSize);
  doc.text("Huella digital derecha", boxX2, idY + boxSize + 0.1, { align: "left" });

  // ── Page 3: Encuesta de Salida ─────────────────────────────────
  // Shared with the termination documents — see drawEncuesta.ts.
  drawEncuestaDeSalida(doc, {
    trabajador,
    puesto,
    fechaLong: effectiveDateLong,
  });

  // ── No footers ─────────────────────────────────────────────────
  // The renuncia packet intentionally omits the folio header (docRef) and
  // page numbers — it's a signed employee-facing packet, not an internal
  // numbered record. Other doc types still call drawFooters.

  return doc.output("blob");
}
