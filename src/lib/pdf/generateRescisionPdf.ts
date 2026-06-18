// Probation termination (Rescisión Periodo de Prueba) PDF.
// 3-page layout mirrors the source template approved by JOI legal:
//   p1 — header + parties block + antecedentes + KPI table
//   p2 — fundamento legal table + declaración formal + liquidación
//   p3 — constancia de notificación + signature blocks (trabajador, supervisor,
//        representante legal, testigo)

import type {
  FinalizationDraft,
  HrDocumentRequestQueueItem,
} from "@/hooks/useHrDocumentRequests";
import { formatDateSpanishFull } from "@/lib/localDate";
import {
  RESCISION_TITLE,
  RESCISION_SUBTITLE,
  RESCISION_ANTECEDENTES_TEMPLATE,
  RESCISION_ANTECEDENTES_2,
  RESCISION_KPI_INTRO,
  RESCISION_KPI_FOOTNOTE,
  RESCISION_FUNDAMENTO_INTRO,
  RESCISION_FUNDAMENTO_ROWS,
  RESCISION_DECLARACION_TEMPLATE,
  RESCISION_DECLARACION_2,
  RESCISION_LIQUIDACION_INTRO,
  RESCISION_LIQUIDACION_BULLETS,
  RESCISION_NO_INDEMNIZACION,
  RESCISION_CONSTANCIA_INTRO,
  RESCISION_LEGAL_REP_NAME,
  RESCISION_LEGAL_REP_TITLE,
  renderTemplate,
} from "@/lib/documentTemplates";
import {
  createDoc,
  drawParagraph,
  drawFooters,
  drawSignatureBlock,
  ensureSpace,
  MARGIN_LEFT,
  MARGIN_RIGHT,
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

export function generateRescisionPdf(
  draft: FinalizationDraft,
  _request: HrDocumentRequestQueueItem,
  opts?: { maskSalary?: boolean },
): Blob {
  const mask = opts?.maskSalary === true;
  const money = (n: number | null | undefined): string =>
    mask ? MASKED_MONEY : fmtMoney(n);
  const letras = (s: string | null | undefined): string =>
    mask ? MASKED_TEXT : (s ?? "");
  const doc = createDoc();
  let y = MARGIN_TOP;

  const trabajador = draft.trabajadorNameSnapshot ?? "";
  const puesto = draft.puestoSnapshot ?? "";
  const supervisor = draft.supervisorNameSnapshot ?? "";
  const hireDate = draft.hireDateSnapshot
    ? formatDateSpanishFull(draft.hireDateSnapshot)
    : "_______________________";
  const contractDate = draft.contractSigningDate
    ? formatDateSpanishFull(draft.contractSigningDate)
    : draft.hireDateSnapshot
      ? formatDateSpanishFull(draft.hireDateSnapshot)
      : "_______________________";
  const terminationDate = draft.terminationEffectiveDate
    ? formatDateSpanishFull(draft.terminationEffectiveDate)
    : "_______________________";

  // ── Page 1: Header ─────────────────────────────────────────────────
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(13);
  doc.text("OUTSOURCE CONSULTING GROUP S.A.S.", PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 0.2;
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Guadalajara, Jalisco, México", PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 0.15;

  // Divider
  doc.setLineWidth(0.01);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.2;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text(RESCISION_TITLE, PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.18;
  doc.setFont("Helvetica", "italic");
  doc.setFontSize(9);
  doc.text(RESCISION_SUBTITLE, PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.15;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.25;

  // Right-aligned date header
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `Guadalajara, Jalisco, a ${terminationDate}`,
    PAGE_WIDTH - MARGIN_RIGHT,
    y,
    { align: "right" },
  );
  y += 0.3;

  // ── Section I: DATOS DE LAS PARTES ─────────────────────────────────
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("I.  DATOS DE LAS PARTES", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  // 2-column box: Empleador (left) | Trabajador (right)
  const partyBoxTop = y;
  const halfW = CONTENT_WIDTH / 2;
  const partyBoxH = 0.85;
  doc.setLineWidth(0.005);
  doc.rect(MARGIN_LEFT, partyBoxTop, halfW, partyBoxH);
  doc.rect(MARGIN_LEFT + halfW, partyBoxTop, halfW, partyBoxH);

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.text("EMPLEADOR", MARGIN_LEFT + 0.1, partyBoxTop + 0.18);
  doc.text("TRABAJADOR(A)", MARGIN_LEFT + halfW + 0.1, partyBoxTop + 0.18);

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    "Outsource Consulting Group S.A.S.",
    MARGIN_LEFT + 0.1,
    partyBoxTop + 0.36,
  );
  doc.text(trabajador, MARGIN_LEFT + halfW + 0.1, partyBoxTop + 0.36);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Guadalajara, Jalisco, México",
    MARGIN_LEFT + 0.1,
    partyBoxTop + 0.52,
  );

  // Worker labels — measure label width so values never collide with the label.
  const workerLabelX = MARGIN_LEFT + halfW + 0.1;
  const labelGap = 0.04;
  doc.setFontSize(9);

  doc.setFont("Helvetica", "bold");
  const puestoLabel = "Puesto: ";
  doc.text(puestoLabel, workerLabelX, partyBoxTop + 0.52);
  doc.setFont("Helvetica", "normal");
  doc.text(
    puesto,
    workerLabelX + doc.getTextWidth(puestoLabel) + labelGap,
    partyBoxTop + 0.52,
  );

  doc.setFont("Helvetica", "bold");
  const hireLabel = "Fecha de ingreso: ";
  doc.text(hireLabel, workerLabelX, partyBoxTop + 0.7);
  doc.setFont("Helvetica", "normal");
  doc.text(
    hireDate,
    workerLabelX + doc.getTextWidth(hireLabel) + labelGap,
    partyBoxTop + 0.7,
  );

  y = partyBoxTop + partyBoxH + 0.25;

  // ── Section II: ANTECEDENTES ───────────────────────────────────────
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("II.  ANTECEDENTES DEL CONTRATO", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  const antecedentesText = renderTemplate(RESCISION_ANTECEDENTES_TEMPLATE, {
    contract_signing_date_long: contractDate,
    puesto,
  });
  y = drawParagraph(doc, antecedentesText, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;
  y = drawParagraph(doc, RESCISION_ANTECEDENTES_2, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.2;

  // ── Section III: KPI TABLE ─────────────────────────────────────────
  y = ensureSpace(doc, y, 1.5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("III.  INDICADORES DE DESEMPEÑO Y RESULTADOS OBTENIDOS", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  y = drawParagraph(doc, RESCISION_KPI_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH, {
    fontSize: 9,
  });
  y += 0.1;

  // KPI table — 4 cols
  const kpiCols = [
    { label: "Métrica / KPI", w: CONTENT_WIDTH * 0.36 },
    { label: "Requerido", w: CONTENT_WIDTH * 0.22 },
    { label: "Registrado", w: CONTENT_WIDTH * 0.22 },
    { label: "Cumplimiento", w: CONTENT_WIDTH * 0.20 },
  ];
  const colXs: number[] = [];
  let cx = MARGIN_LEFT;
  for (const c of kpiCols) {
    colXs.push(cx);
    cx += c.w;
  }

  // Header row
  const kpiHeaderH = 0.32;
  y = ensureSpace(doc, y, kpiHeaderH);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  for (let i = 0; i < kpiCols.length; i++) {
    // Re-assert the fill on every cell: doc.text() flips the active fill color
    // to the text color (black), so without this the cells after the first one
    // fill solid black and hide the title.
    doc.setFillColor(220, 220, 220);
    doc.rect(colXs[i], y, kpiCols[i].w, kpiHeaderH, "FD");
    const lines = doc.splitTextToSize(kpiCols[i].label, kpiCols[i].w - 0.12);
    let ly = y + 0.15;
    for (const line of lines) {
      doc.text(line, colXs[i] + kpiCols[i].w / 2, ly, { align: "center" });
      ly += 0.12;
    }
  }
  y += kpiHeaderH;

  // Data rows
  const rows = draft.rescisionKpiTable.length > 0
    ? draft.rescisionKpiTable
    : [{ kpi: "", required: "", recorded: "", met: "" }];

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  for (const row of rows) {
    // When the agent did not meet the goal, spell out how many days fell short.
    const days = (row.daysNotMet ?? "").trim();
    const metCell =
      row.met === "No" && days
        ? `No — no alcanzó la meta en ${days} ${days === "1" ? "día" : "días"}`
        : row.met;
    const values = [row.kpi, row.required, row.recorded, metCell];
    const wrapped = values.map((v, i) =>
      doc.splitTextToSize(v || "—", kpiCols[i].w - 0.12),
    );
    const maxLines = Math.max(...wrapped.map((w) => w.length));
    const rowH = Math.max(0.32, 0.16 + 0.13 * maxLines);
    y = ensureSpace(doc, y, rowH);

    for (let i = 0; i < kpiCols.length; i++) {
      doc.rect(colXs[i], y, kpiCols[i].w, rowH);
      let ly = y + 0.16;
      for (const line of wrapped[i]) {
        doc.text(line, colXs[i] + kpiCols[i].w / 2, ly, { align: "center" });
        ly += 0.13;
      }
    }
    y += rowH;
  }
  y += 0.15;

  // Footnote
  y = drawParagraph(doc, RESCISION_KPI_FOOTNOTE, MARGIN_LEFT, y, CONTENT_WIDTH, {
    fontSize: 8,
    fontStyle: "italic",
  });
  y += 0.2;

  // ── Section IV: FUNDAMENTO LEGAL ───────────────────────────────────
  y = ensureSpace(doc, y, 2.5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("IV.  FUNDAMENTO LEGAL", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  y = drawParagraph(doc, RESCISION_FUNDAMENTO_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;

  // 2-col table: article (gray) | text (white)
  const artColW = 1.4;
  const textColW = CONTENT_WIDTH - artColW;
  doc.setFontSize(9);
  for (const row of RESCISION_FUNDAMENTO_ROWS) {
    const textLines = doc.splitTextToSize(row.text, textColW - 0.16);
    const rowH = Math.max(0.35, 0.16 + 0.13 * textLines.length);
    y = ensureSpace(doc, y, rowH);

    doc.setFillColor(230, 230, 230);
    doc.rect(MARGIN_LEFT, y, artColW, rowH, "FD");
    doc.setFont("Helvetica", "bold");
    const artLines = doc.splitTextToSize(row.article, artColW - 0.16);
    let ay = y + (rowH - artLines.length * 0.13) / 2 + 0.1;
    for (const line of artLines) {
      doc.text(line, MARGIN_LEFT + artColW / 2, ay, { align: "center" });
      ay += 0.13;
    }

    doc.rect(MARGIN_LEFT + artColW, y, textColW, rowH);
    doc.setFont("Helvetica", "normal");
    let ty = y + 0.16;
    for (const line of textLines) {
      doc.text(line, MARGIN_LEFT + artColW + 0.08, ty);
      ty += 0.13;
    }
    y += rowH;
  }
  y += 0.25;

  // ── Section V: DECLARACIÓN FORMAL ──────────────────────────────────
  y = ensureSpace(doc, y, 1.5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("V.  DECLARACIÓN FORMAL DE RESCISIÓN", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  // Boxed paragraph (matches source layout — left-bar emphasis box)
  const declaracionText = renderTemplate(RESCISION_DECLARACION_TEMPLATE, {
    termination_date_long: terminationDate,
  });

  // Compute box height by measuring the text
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  const declLines = doc.splitTextToSize(declaracionText, CONTENT_WIDTH - 0.25);
  const declH = 0.2 + declLines.length * 0.14;
  y = ensureSpace(doc, y, declH);

  // Left bar
  doc.setFillColor(180, 180, 180);
  doc.rect(MARGIN_LEFT, y, 0.04, declH, "F");
  // Top/bottom hairlines
  doc.setDrawColor(180, 180, 180);
  doc.line(MARGIN_LEFT, y, MARGIN_LEFT + CONTENT_WIDTH, y);
  doc.line(MARGIN_LEFT, y + declH, MARGIN_LEFT + CONTENT_WIDTH, y + declH);
  doc.setDrawColor(0, 0, 0);

  let dy = y + 0.16;
  for (const line of declLines) {
    doc.text(line, MARGIN_LEFT + 0.12, dy);
    dy += 0.14;
  }
  y += declH + 0.15;

  // HR-drafted motivación / fundamentación (formal narrative).
  // Renders between the boxed declaration and the no-discrimination closing —
  // this is where the patrón's reasoning belongs in Mexican rescission letters.
  if (draft.narrative && draft.narrative.trim().length > 0) {
    const paragraphs = draft.narrative.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      y = drawParagraph(doc, para, MARGIN_LEFT, y, CONTENT_WIDTH);
      y += 0.1;
    }
    y += 0.05;
  }

  y = drawParagraph(doc, RESCISION_DECLARACION_2, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.25;

  // ── Section VI: LIQUIDACIÓN ────────────────────────────────────────
  y = ensureSpace(doc, y, 2.0);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VI.  LIQUIDACIÓN Y DERECHOS DEL TRABAJADOR", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  y = drawParagraph(doc, RESCISION_LIQUIDACION_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;

  doc.setFontSize(10);
  for (const bullet of RESCISION_LIQUIDACION_BULLETS) {
    y = ensureSpace(doc, y, 0.18);
    doc.setFont("Helvetica", "normal");
    doc.text("•", MARGIN_LEFT + 0.15, y);
    const blines = doc.splitTextToSize(bullet, CONTENT_WIDTH - 0.35);
    let by = y;
    for (const line of blines) {
      doc.text(line, MARGIN_LEFT + 0.35, by);
      by += 0.14;
    }
    y = by + 0.02;
  }
  y += 0.1;

  // Computed finiquito amounts (if available)
  if (
    draft.salariosDevengadosMonto != null ||
    draft.aguinaldoMonto != null ||
    draft.vacacionesMonto != null ||
    draft.primaVacacionalMonto != null ||
    draft.totalMonto != null
  ) {
    y = ensureSpace(doc, y, 1.5);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Desglose de finiquito:", MARGIN_LEFT, y);
    y += 0.2;

    const finRows = [
      { label: "Aguinaldo proporcional", value: money(draft.aguinaldoMonto) },
      { label: "Vacaciones correspondientes", value: money(draft.vacacionesMonto) },
      { label: "Prima vacacional (25%)", value: money(draft.primaVacacionalMonto) },
      { label: "Salarios Devengados de Días", value: money(draft.salariosDevengadosMonto) },
    ];
    const labelColW = 2.8;
    const valueColW = CONTENT_WIDTH - labelColW;
    doc.setFontSize(10);
    for (const row of finRows) {
      const rowH = 0.28;
      y = ensureSpace(doc, y, rowH);
      doc.rect(MARGIN_LEFT, y, labelColW, rowH);
      doc.setFont("Helvetica", "normal");
      doc.text(row.label, MARGIN_LEFT + 0.1, y + 0.18);
      doc.rect(MARGIN_LEFT + labelColW, y, valueColW, rowH);
      doc.text(row.value, MARGIN_LEFT + labelColW + 0.1, y + 0.18);
      y += rowH;
    }

    // Total row (bold + filled)
    const totalH = 0.3;
    y = ensureSpace(doc, y, totalH);
    doc.setFillColor(230, 230, 230);
    doc.rect(MARGIN_LEFT, y, labelColW, totalH, "FD");
    doc.setFont("Helvetica", "bold");
    doc.text("Total", MARGIN_LEFT + 0.1, y + 0.2);
    doc.rect(MARGIN_LEFT + labelColW, y, valueColW, totalH);
    doc.text(money(draft.totalMonto), MARGIN_LEFT + labelColW + 0.1, y + 0.2);
    y += totalH;

    if (draft.totalEnLetras || mask) {
      const letraH = 0.28;
      y = ensureSpace(doc, y, letraH);
      doc.rect(MARGIN_LEFT, y, labelColW, letraH);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Importe con letra", MARGIN_LEFT + 0.1, y + 0.18);
      doc.rect(MARGIN_LEFT + labelColW, y, valueColW, letraH);
      const letraLines = doc.splitTextToSize(
        letras(draft.totalEnLetras),
        valueColW - 0.2,
      );
      doc.text(letraLines[0] ?? "", MARGIN_LEFT + labelColW + 0.1, y + 0.18);
      y += letraH;
      doc.setFontSize(10);
    }
    y += 0.15;
  }

  y = drawParagraph(doc, RESCISION_NO_INDEMNIZACION, MARGIN_LEFT, y, CONTENT_WIDTH, {
    fontSize: 9,
    fontStyle: "italic",
  });
  y += 0.2;

  // ── Section VII: CONSTANCIA + SIGNATURES ──────────────────────────
  // Force new page for clean signature layout
  doc.addPage();
  y = MARGIN_TOP;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VII.  CONSTANCIA DE NOTIFICACIÓN Y ACUSE DE RECIBO", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.2;

  y = drawParagraph(doc, RESCISION_CONSTANCIA_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.6;

  // Row 1: trabajador signature (centered, single column)
  const sigColW = CONTENT_WIDTH / 2;
  drawSignatureBlock(
    doc,
    MARGIN_LEFT + CONTENT_WIDTH / 4,
    y,
    sigColW,
    "Trabajador(a) · Firma y huella digital",
    trabajador,
    { bold: true },
  );
  y += 1.5;

  // Row 2: supervisor (left) | representante legal (right)
  const halfSigW = CONTENT_WIDTH / 2 - 0.1;
  drawSignatureBlock(
    doc,
    MARGIN_LEFT,
    y,
    halfSigW,
    "Supervisor(a) Directo(a) · Firma",
    supervisor || undefined,
  );
  drawSignatureBlock(
    doc,
    MARGIN_LEFT + halfSigW + 0.2,
    y,
    halfSigW,
    RESCISION_LEGAL_REP_TITLE,
    RESCISION_LEGAL_REP_NAME,
    { bold: true },
  );
  y += 1.5;

  // Row 3: testigo (centered)
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("TESTIGO", PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.3;
  drawSignatureBlock(
    doc,
    MARGIN_LEFT + CONTENT_WIDTH / 4,
    y,
    sigColW,
    "Testigo de la notificación",
  );

  // Footer footer line at bottom of last page
  doc.setFont("Helvetica", "italic");
  doc.setFontSize(8);
  doc.text(
    "Documento confidencial · Recursos Humanos · Outsource Consulting Group S.A.S. · Guadalajara, Jalisco",
    PAGE_WIDTH / 2,
    10.3,
    { align: "center" },
  );

  // ── Encuesta de Salida ─────────────────────────────────────────────
  // Appended to every baja (quit OR termination). Shared renderer — see
  // drawEncuesta.ts. Added on its own page after the signature section.
  drawEncuestaDeSalida(doc, {
    trabajador,
    puesto,
    fechaLong: terminationDate,
  });

  drawFooters(doc, draft.docRef ?? "");

  return doc.output("blob");
}
