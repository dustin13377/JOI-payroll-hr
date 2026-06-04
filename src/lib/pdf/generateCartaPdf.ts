import type { FinalizationDraft, HrDocumentRequestQueueItem } from "@/hooks/useHrDocumentRequests";
import {
  CARTA_OPENING,
  CARTA_SECOND_PARAGRAPH,
  CARTA_ACKNOWLEDGMENT,
  CARTA_COMMITMENTS,
  CARTA_EVAL_PERIOD,
  CARTA_EVIDENCE,
  CARTA_CLOSING_1,
  CARTA_CLOSING_2,
  CARTA_CLOSING_3_TEMPLATE,
  CARTA_CLOSING_4_TEMPLATE,
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
} from "./pdfHelpers";

export function generateCartaPdf(
  draft: FinalizationDraft,
  request: HrDocumentRequestQueueItem,
): Blob {
  const doc = createDoc();
  let y = MARGIN_TOP;

  const vars = {
    trabajador_name: draft.trabajadorNameSnapshot ?? "",
    puesto: draft.puestoSnapshot ?? "",
    company_name: draft.companyLegalNameSnapshot ?? "",
    company_address: draft.companyLegalAddressSnapshot ?? "",
    trabajador_name_lower: (draft.trabajadorNameSnapshot ?? "").toLowerCase(),
  };

  // ── Title block ────────────────────────────────────────────────────
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text(vars.company_name, PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.2;
  doc.text("CARTA COMPROMISO DE MEJORA DE DESEMPEÑO LABORAL", PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 0.3;

  // Date
  doc.setFont("Helvetica", "bolditalic");
  doc.setFontSize(10);
  doc.text(
    draft.incidentDateLongSnapshot ?? "",
    PAGE_WIDTH - MARGIN_RIGHT,
    y,
    { align: "right" },
  );
  y += 0.3;

  // ── Metadata table ─────────────────────────────────────────────────
  y = drawMetadataTable(
    doc,
    [
      { label: "TRABAJADOR", value: vars.trabajador_name },
      { label: "HORARIO", value: draft.horarioSnapshot ?? "" },
      { label: "PUESTO", value: vars.puesto },
    ],
    MARGIN_LEFT,
    y,
    1.5,
    CONTENT_WIDTH,
  );
  y += 0.2;

  // ── Opening paragraph ─────────────────────────────────────────────
  y = drawParagraph(doc, renderTemplate(CARTA_OPENING, vars), MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;

  // ── Second paragraph ──────────────────────────────────────────────
  y = drawParagraph(doc, CARTA_SECOND_PARAGRAPH, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.15;

  // ── Incident heading ──────────────────────────────────────────────
  const reason = request.reason || "Situación reportada";
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

  // ── Acknowledgment ────────────────────────────────────────────────
  y = drawParagraph(doc, CARTA_ACKNOWLEDGMENT, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;

  // ── Numbered commitments ──────────────────────────────────────────
  for (let i = 0; i < CARTA_COMMITMENTS.length; i++) {
    const c = CARTA_COMMITMENTS[i];
    const text = `${i + 1}. ${c.bold}${c.rest}`;
    y = drawParagraph(doc, text, MARGIN_LEFT + 0.2, y, CONTENT_WIDTH - 0.2);
    y += 0.05;
  }
  y += 0.1;

  // ── KPI table ─────────────────────────────────────────────────────
  if (draft.kpiTable.length > 0) {
    for (const kpi of draft.kpiTable) {
      y = drawMetadataTable(
        doc,
        [
          { label: "ÁREA A MEJORAR", value: kpi.area },
          { label: "INDICADOR/KPI", value: kpi.indicador },
          { label: "META", value: kpi.meta },
        ],
        MARGIN_LEFT,
        y,
        1.5,
        CONTENT_WIDTH,
      );
      y += 0.15;
    }
  }

  // ── Period / Evidence table ────────────────────────────────────────
  y = ensureSpace(doc, y, 1.0);
  y = drawMetadataTable(
    doc,
    [
      { label: "PERIODO DE EVALUACIÓN", value: CARTA_EVAL_PERIOD },
      { label: "EVIDENCIA", value: CARTA_EVIDENCE },
    ],
    MARGIN_LEFT,
    y,
    2.0,
    CONTENT_WIDTH,
  );
  y += 0.2;

  // ── Closing paragraphs ────────────────────────────────────────────
  y = drawParagraph(doc, CARTA_CLOSING_1, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.15;
  y = drawParagraph(doc, CARTA_CLOSING_2, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.15;
  y = drawParagraph(
    doc,
    renderTemplate(CARTA_CLOSING_3_TEMPLATE, vars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.15;
  y = drawParagraph(
    doc,
    renderTemplate(CARTA_CLOSING_4_TEMPLATE, vars),
    MARGIN_LEFT,
    y,
    CONTENT_WIDTH,
  );
  y += 0.4;

  // ── Signature blocks ──────────────────────────────────────────────
  const colW = CONTENT_WIDTH / 2 - 0.1;
  const leftX = MARGIN_LEFT;
  const rightX = MARGIN_LEFT + colW + 0.2;

  y = ensureSpace(doc, y, 1.5);

  // Row 1: empty label left, ENTERADO right
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("ENTERADO", rightX + colW / 2, y, { align: "center" });
  y += 0.3;

  const sigY1 = y;
  drawSignatureBlock(doc, leftX, sigY1, colW, "SUPERVISOR TEAM LEAD", draft.supervisorNameSnapshot ?? "");
  y = drawSignatureBlock(doc, rightX, sigY1, colW, "TRABAJADOR", vars.trabajador_name, { bold: true });
  y += 0.2;

  // Row 2: Admin left, Operations right
  const sigY2 = ensureSpace(doc, y, 0.8);
  drawSignatureBlock(doc, leftX, sigY2, colW, "DIRECCIÓN ADMINISTRATIVA");
  y = drawSignatureBlock(doc, rightX, sigY2, colW, "DIRECCIÓN DE OPERACIONES", undefined, { bold: true });

  // ── Footers ────────────────────────────────────────────────────────
  drawFooters(doc, draft.docRef ?? "");

  return doc.output("blob");
}
