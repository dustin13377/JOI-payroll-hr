import type { FinalizationDraft, HrDocumentRequestQueueItem } from "@/hooks/useHrDocumentRequests";
import { formatDateSpanishFull, formatDateSpanishMedium } from "@/lib/localDate";
import {
  ACTA_OPENING_TEMPLATE,
  ACTA_LEGAL_BOILERPLATE_TEMPLATE,
  ACTA_AUDIENCIA_TEMPLATE,
  ACTA_CLOSING_1,
  ACTA_CLOSING_2_TEMPLATE,
  ACTA_CLOSING_3_TEMPLATE,
  ACTA_CLOSING_4_TEMPLATE,
  renderTemplate,
} from "@/lib/documentTemplates";
import {
  createDoc,
  drawParagraph,
  drawMetadataTable,
  drawFooters,
  drawSignatureBlock,
  ensureSpace,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  PAGE_WIDTH,
  MARGIN_TOP,
  CONTENT_WIDTH,
  PAGE_HEIGHT,
  MARGIN_BOTTOM,
} from "./pdfHelpers";

export interface PriorCartaInfo {
  id: string;
  doc_ref: string | null;
  created_at: string;
}

function extractTimeFromDocRef(docRef: string | null): string {
  if (!docRef) return "__:__";
  const match = docRef.match(/(\d{2})(\d{2})$/);
  if (!match) return "__:__";
  return `${match[1]}:${match[2]}`;
}

function formatWitnesses(witnesses: { name: string; role: string }[]): {
  witness1: string;
  witness2: string;
} {
  const blank = "_______________________________";
  return {
    witness1: witnesses[0]?.name?.trim() || blank,
    witness2: witnesses[1]?.name?.trim() || blank,
  };
}

export function generateActaPdf(
  draft: FinalizationDraft,
  request: HrDocumentRequestQueueItem,
  priorCarta: PriorCartaInfo | null,
): Blob {
  const doc = createDoc();
  let y = MARGIN_TOP;

  const trabajadorName = draft.trabajadorNameSnapshot ?? "";
  const supervisorName = draft.supervisorNameSnapshot ?? "";
  const companyAddress = draft.companyLegalAddressSnapshot ?? "";
  const reason = request.reason || "Situación reportada";
  const incidentDayShort = formatDateSpanishFull(request.incidentDate);
  const incidentDateShort = formatDateSpanishMedium(request.incidentDate);
  const { witness1, witness2 } = formatWitnesses(draft.witnesses ?? []);
  const docTime = extractTimeFromDocRef(draft.docRef);

  const vars: Record<string, string> = {
    trabajador_name: trabajadorName,
    supervisor_name: supervisorName,
    company_address: companyAddress,
    reason,
    incident_date_long: draft.incidentDateLongSnapshot ?? "",
    incident_day_short: incidentDayShort,
    incident_date_short: incidentDateShort,
    time: docTime,
    witness_1: witness1,
    witness_2: witness2,
  };

  // ── Title block ────────────────────────────────────────────────────
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text("ASUNTO: ACTA ADMINISTRATIVA", PAGE_WIDTH / 2, y, { align: "center" });
  // Underline
  const titleW = doc.getTextWidth("ASUNTO: ACTA ADMINISTRATIVA");
  doc.setLineWidth(0.01);
  doc.line(
    PAGE_WIDTH / 2 - titleW / 2,
    y + 0.03,
    PAGE_WIDTH / 2 + titleW / 2,
    y + 0.03,
  );
  y += 0.3;

  // Date
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  const dateText = draft.incidentDateLongSnapshot ?? "";
  doc.text(dateText, PAGE_WIDTH - MARGIN_RIGHT, y, { align: "right" });
  const dateW = doc.getTextWidth(dateText);
  doc.line(
    PAGE_WIDTH - MARGIN_RIGHT - dateW,
    y + 0.03,
    PAGE_WIDTH - MARGIN_RIGHT,
    y + 0.03,
  );
  y += 0.3;

  // ── Metadata table ─────────────────────────────────────────────────
  y = drawMetadataTable(
    doc,
    [
      { label: "TRABAJADOR:", value: trabajadorName },
      { label: "PUESTO:", value: draft.puestoSnapshot ?? "" },
      { label: "HORARIO:", value: draft.horarioSnapshot ?? "" },
    ],
    MARGIN_LEFT,
    y,
    1.5,
    CONTENT_WIDTH,
  );
  y += 0.2;

  // ── Opening paragraph ─────────────────────────────────────────────
  y = drawParagraph(
    doc,
    renderTemplate(ACTA_OPENING_TEMPLATE, vars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.15;

  // ── Incident heading ──────────────────────────────────────────────
  y = drawParagraph(doc, reason, MARGIN_LEFT, y, CONTENT_WIDTH, {
    fontStyle: "bolditalic",
  });
  y += 0.1;

  // ── Narrative block ───────────────────────────────────────────────
  // Render the full HR narrative, preserving paragraph breaks. We split on
  // blank lines and draw each paragraph separately (with spacing) so nothing
  // typed in the Formal Narrative field is collapsed or dropped. drawParagraph
  // paginates per line, so arbitrarily long narratives flow onto more pages.
  const narrativeRaw = (draft.narrative ?? "").trim();
  if (narrativeRaw.length > 0) {
    const paragraphs = narrativeRaw
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    paragraphs.forEach((para, idx) => {
      const open = idx === 0 ? "\u201C" : "";
      const close = idx === paragraphs.length - 1 ? "\u201D" : "";
      y = drawParagraph(
        doc,
        `${open}${para}${close}`,
        MARGIN_LEFT + 0.25,
        y,
        CONTENT_WIDTH - 0.5,
        { fontStyle: "italic" },
      );
      y += 0.1;
    });
    y += 0.05;
  }

  // ── Reincidencia ──────────────────────────────────────────────────
  if (priorCarta) {
    const reincText = `Antecedente: se cita la carta compromiso previa ${priorCarta.doc_ref ?? "sin ref"} emitida el ${formatDateSpanishMedium(priorCarta.created_at)}.`;
    y = drawParagraph(doc, reincText, MARGIN_LEFT, y, CONTENT_WIDTH, {
      fontStyle: "italic",
    });
    y += 0.15;
  }

  // ── Legal boilerplate ─────────────────────────────────────────────
  y = drawParagraph(
    doc,
    renderTemplate(ACTA_LEGAL_BOILERPLATE_TEMPLATE, vars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.15;

  // ── Audiencia paragraph ───────────────────────────────────────────
  y = drawParagraph(
    doc,
    renderTemplate(ACTA_AUDIENCIA_TEMPLATE, vars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.15;

  // ── Employee response box (ruled lines) ───────────────────────────
  y = ensureSpace(doc, y, 2.5);
  const boxH = 2.0;
  doc.setLineWidth(0.005);
  doc.rect(MARGIN_LEFT, y, CONTENT_WIDTH, boxH);
  const lineSpacing = boxH / 12;
  for (let i = 1; i < 12; i++) {
    const ly = y + lineSpacing * i;
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN_LEFT + 0.1, ly, MARGIN_LEFT + CONTENT_WIDTH - 0.1, ly);
  }
  doc.setDrawColor(0, 0, 0);
  y += boxH + 0.2;

  // ── Closing paragraphs ────────────────────────────────────────────
  y = drawParagraph(doc, ACTA_CLOSING_1, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.15;
  y = drawParagraph(
    doc,
    renderTemplate(ACTA_CLOSING_2_TEMPLATE, vars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.15;
  y = drawParagraph(
    doc,
    renderTemplate(ACTA_CLOSING_3_TEMPLATE, vars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.15;
  y = drawParagraph(
    doc,
    renderTemplate(ACTA_CLOSING_4_TEMPLATE, vars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.4;

  // ── Signature blocks ──────────────────────────────────────────────
  const colW = CONTENT_WIDTH / 2 - 0.1;
  const leftX = MARGIN_LEFT;
  const rightX = MARGIN_LEFT + colW + 0.2;

  // Row 1: ATENTAMENTE / TRABAJADOR
  y = ensureSpace(doc, y, 1.5);

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ATENTAMENTE", leftX + colW / 2, y, { align: "center" });
  doc.text("TRABAJADOR", rightX + colW / 2, y, { align: "center" });
  y += 0.3;

  const sigY1 = y;
  drawSignatureBlock(doc, leftX, sigY1, colW, "", "OUTSOURCE CONSULTING GROUP SAS", { bold: true });
  y = drawSignatureBlock(doc, rightX, sigY1, colW, "", trabajadorName, { bold: true });
  y += 0.3;

  // Row 2: JEFE DIRECTO (centered)
  y = ensureSpace(doc, y, 0.8);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("JEFE DIRECTO", PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.3;
  y = drawSignatureBlock(
    doc,
    MARGIN_LEFT + CONTENT_WIDTH / 4,
    y,
    CONTENT_WIDTH / 2,
    "",
    supervisorName,
    { bold: true },
  );
  y += 0.3;

  // Row 3: Two witnesses
  y = ensureSpace(doc, y, 0.8);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TESTIGO", leftX + colW / 2, y, { align: "center" });
  doc.text("TESTIGO", rightX + colW / 2, y, { align: "center" });
  y += 0.3;

  const w1Name = draft.witnesses?.[0]?.name?.trim() || undefined;
  const w2Name = draft.witnesses?.[1]?.name?.trim() || undefined;
  const sigY3 = y;
  drawSignatureBlock(doc, leftX, sigY3, colW, "", w1Name, { bold: true });
  drawSignatureBlock(doc, rightX, sigY3, colW, "", w2Name, { bold: true });

  // ── Footers ────────────────────────────────────────────────────────
  drawFooters(doc, draft.docRef ?? "");

  return doc.output("blob");
}
