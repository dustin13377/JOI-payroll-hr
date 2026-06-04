// Post-probation termination (Rescisión por Bajo Desempeño, Art. 47 Frac. XI).
// For an employee who PASSED the 30-day probation and is on a fixed-term
// contract (por tiempo determinado / campaign duration), terminated for
// sustained KPI failure — rescisión sin responsabilidad para el patrón.
//
// Distinct from generateRescisionPdf (Art. 39-A probation termination). Same
// visual scaffolding, different legal text, plus two extra sections:
//   VII — Entrega-Recepción de materiales y accesos
//   VIII — Acuse de recibo + signature blocks
//
// All personal names rendered here are full legal names (trabajador,
// supervisor, representante legal) per JOI policy — work/display names are
// never used on legal documents.

import type {
  FinalizationDraft,
  HrDocumentRequestQueueItem,
} from "@/hooks/useHrDocumentRequests";
import { formatDateSpanishFull } from "@/lib/localDate";
import {
  RESCISION_DESEMPENO_TITLE,
  RESCISION_DESEMPENO_SUBTITLE,
  RESCISION_DESEMPENO_ANTECEDENTES_1_TEMPLATE,
  RESCISION_DESEMPENO_ANTECEDENTES_2_TEMPLATE,
  RESCISION_DESEMPENO_ANTECEDENTES_3_TEMPLATE,
  RESCISION_DESEMPENO_KPI_INTRO,
  RESCISION_DESEMPENO_KPI_FOOTNOTE,
  RESCISION_DESEMPENO_FUNDAMENTO_INTRO,
  RESCISION_DESEMPENO_FUNDAMENTO_ROWS,
  RESCISION_DESEMPENO_DECLARACION_TEMPLATE,
  RESCISION_DESEMPENO_DECLARACION_2,
  RESCISION_DESEMPENO_LIQUIDACION_INTRO,
  RESCISION_DESEMPENO_LIQUIDACION_BULLETS,
  RESCISION_DESEMPENO_NO_INDEMNIZACION,
  RESCISION_DESEMPENO_ENTREGA_INTRO,
  RESCISION_DESEMPENO_ENTREGA_BULLETS,
  RESCISION_DESEMPENO_ACUSE,
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

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "$ 0.00";
  return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MASKED_MONEY = "$ * * * *";
const MASKED_TEXT = "* * * * * * * * * *";

const DEFAULT_COMPANY = "OUTSOURCE CONSULTING GROUP S.A.S.";
const BLANK = "_______________________";

export function generateRescisionDesempenoPdf(
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
  let y = MARGIN_TOP;

  const company = draft.companyLegalNameSnapshot || DEFAULT_COMPANY;
  const trabajador = draft.trabajadorNameSnapshot ?? "";
  const puesto = draft.puestoSnapshot ?? "";
  const supervisor = draft.supervisorNameSnapshot ?? "";
  const hireDate = draft.hireDateSnapshot
    ? formatDateSpanishFull(draft.hireDateSnapshot)
    : BLANK;
  const contractDate = draft.contractSigningDate
    ? formatDateSpanishFull(draft.contractSigningDate)
    : draft.hireDateSnapshot
      ? formatDateSpanishFull(draft.hireDateSnapshot)
      : BLANK;
  const terminationDate = draft.terminationEffectiveDate
    ? formatDateSpanishFull(draft.terminationEffectiveDate)
    : BLANK;

  // ── Page 1: Header ─────────────────────────────────────────────────
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(13);
  doc.text(DEFAULT_COMPANY, PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.2;
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Guadalajara, Jalisco, México", PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 0.15;

  doc.setLineWidth(0.01);
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.2;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(11);
  doc.text(RESCISION_DESEMPENO_TITLE, PAGE_WIDTH / 2, y, { align: "center" });
  y += 0.18;
  doc.setFont("Helvetica", "italic");
  doc.setFontSize(9);
  const subtitleLines = doc.splitTextToSize(
    RESCISION_DESEMPENO_SUBTITLE,
    CONTENT_WIDTH,
  );
  for (const line of subtitleLines) {
    doc.text(line, PAGE_WIDTH / 2, y, { align: "center" });
    y += 0.14;
  }
  y += 0.04;
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

  const partyBoxTop = y;
  const halfW = CONTENT_WIDTH / 2;
  const partyBoxH = 1.05;
  doc.setLineWidth(0.005);
  doc.rect(MARGIN_LEFT, partyBoxTop, halfW, partyBoxH);
  doc.rect(MARGIN_LEFT + halfW, partyBoxTop, halfW, partyBoxH);

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  doc.text("EMPLEADOR", MARGIN_LEFT + 0.1, partyBoxTop + 0.18);
  doc.text("TRABAJADOR(A)", MARGIN_LEFT + halfW + 0.1, partyBoxTop + 0.18);

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Outsource Consulting Group S.A.S.", MARGIN_LEFT + 0.1, partyBoxTop + 0.36);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Guadalajara, Jalisco, México", MARGIN_LEFT + 0.1, partyBoxTop + 0.52);

  // Worker labels — measure label width so values never collide with the label.
  const workerLabelX = MARGIN_LEFT + halfW + 0.1;
  const labelGap = 0.04;
  doc.setFontSize(9);

  const drawLabeledValue = (label: string, value: string, yy: number) => {
    doc.setFont("Helvetica", "bold");
    doc.text(label, workerLabelX, yy);
    doc.setFont("Helvetica", "normal");
    doc.text(
      value || BLANK,
      workerLabelX + doc.getTextWidth(label) + labelGap,
      yy,
    );
  };

  drawLabeledValue("Nombre: ", trabajador, partyBoxTop + 0.36);
  drawLabeledValue("Puesto: ", puesto, partyBoxTop + 0.54);
  drawLabeledValue("Fecha de ingreso: ", hireDate, partyBoxTop + 0.72);
  drawLabeledValue("Fecha efectiva de baja: ", terminationDate, partyBoxTop + 0.9);

  y = partyBoxTop + partyBoxH + 0.25;

  // ── Section II: ANTECEDENTES ───────────────────────────────────────
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("II.  ANTECEDENTES DE LA RELACIÓN LABORAL", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  const ant1 = renderTemplate(RESCISION_DESEMPENO_ANTECEDENTES_1_TEMPLATE, {
    hire_date_long: hireDate,
    company_name: company,
  });
  y = drawParagraph(doc, ant1, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;
  const ant2 = renderTemplate(RESCISION_DESEMPENO_ANTECEDENTES_2_TEMPLATE, {
    contract_signing_date_long: contractDate,
  });
  y = drawParagraph(doc, ant2, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;
  const ant3 = renderTemplate(RESCISION_DESEMPENO_ANTECEDENTES_3_TEMPLATE, {
    campaign: request.campaignName || "asignada",
  });
  y = drawParagraph(doc, ant3, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.2;

  // ── Section III: INCUMPLIMIENTO / KPI TABLE ────────────────────────
  y = ensureSpace(doc, y, 1.5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("III.  INCUMPLIMIENTO DE INDICADORES DE DESEMPEÑO", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  y = drawParagraph(doc, RESCISION_DESEMPENO_KPI_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH, {
    fontSize: 9,
  });
  y += 0.1;

  const kpiCols = [
    { label: "Indicador / KPI", w: CONTENT_WIDTH * 0.26 },
    { label: "Obligaciones Contractuales", w: CONTENT_WIDTH * 0.22 },
    {
      label:
        "Promedio Mensual Realizado de (1 del mes pasado a último del mes pasado)",
      w: CONTENT_WIDTH * 0.28,
    },
    { label: "Cumplimiento de las obligaciones contractuales", w: CONTENT_WIDTH * 0.24 },
  ];
  const colXs: number[] = [];
  let cx = MARGIN_LEFT;
  for (const c of kpiCols) {
    colXs.push(cx);
    cx += c.w;
  }

  // Header height grows to fit the longest wrapped column label.
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  const headerWrapped = kpiCols.map((c) =>
    doc.splitTextToSize(c.label, c.w - 0.12),
  );
  const maxHeaderLines = Math.max(...headerWrapped.map((l) => l.length));
  const kpiHeaderH = Math.max(0.32, 0.1 + 0.12 * maxHeaderLines);
  y = ensureSpace(doc, y, kpiHeaderH);
  for (let i = 0; i < kpiCols.length; i++) {
    // Re-assert the fill on every cell: doc.text() flips the active fill color
    // to the text color (black), so without this the cells after the first one
    // fill solid black and hide the title.
    doc.setFillColor(220, 220, 220);
    doc.rect(colXs[i], y, kpiCols[i].w, kpiHeaderH, "FD");
    const lines = headerWrapped[i];
    // Vertically center the label block within the header cell.
    let ly = y + (kpiHeaderH - 0.12 * (lines.length - 1)) / 2;
    for (const line of lines) {
      doc.text(line, colXs[i] + kpiCols[i].w / 2, ly, { align: "center" });
      ly += 0.12;
    }
  }
  y += kpiHeaderH;

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

  y = drawParagraph(doc, RESCISION_DESEMPENO_KPI_FOOTNOTE, MARGIN_LEFT, y, CONTENT_WIDTH, {
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

  y = drawParagraph(doc, RESCISION_DESEMPENO_FUNDAMENTO_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;

  const artColW = 1.4;
  const textColW = CONTENT_WIDTH - artColW;
  doc.setFontSize(9);
  for (const row of RESCISION_DESEMPENO_FUNDAMENTO_ROWS) {
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

  // ── Section V: DECLARACIÓN FORMAL DE RESCISIÓN Y BAJA ──────────────
  y = ensureSpace(doc, y, 1.5);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("V.  DECLARACIÓN FORMAL DE RESCISIÓN Y BAJA", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  const declaracionText = renderTemplate(RESCISION_DESEMPENO_DECLARACION_TEMPLATE, {
    company_name: company,
    trabajador_name: trabajador || BLANK,
    termination_date_long: terminationDate,
  });

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  const declLines = doc.splitTextToSize(declaracionText, CONTENT_WIDTH - 0.25);
  const declH = 0.2 + declLines.length * 0.14;
  y = ensureSpace(doc, y, declH);

  doc.setFillColor(180, 180, 180);
  doc.rect(MARGIN_LEFT, y, 0.04, declH, "F");
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

  // HR-drafted motivación / fundamentación (optional formal narrative).
  if (draft.narrative && draft.narrative.trim().length > 0) {
    const paragraphs = draft.narrative.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      y = drawParagraph(doc, para, MARGIN_LEFT, y, CONTENT_WIDTH);
      y += 0.1;
    }
    y += 0.05;
  }

  y = drawParagraph(doc, RESCISION_DESEMPENO_DECLARACION_2, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.25;

  // ── Section VI: CONCEPTOS DE LIQUIDACIÓN ───────────────────────────
  y = ensureSpace(doc, y, 2.0);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VI.  CONCEPTOS DE LIQUIDACIÓN", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  y = drawParagraph(doc, RESCISION_DESEMPENO_LIQUIDACION_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;

  doc.setFontSize(10);
  for (const bullet of RESCISION_DESEMPENO_LIQUIDACION_BULLETS) {
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

  // Optional computed finiquito desglose (shown only when HR fills amounts).
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
      const letraLines = doc.splitTextToSize(letras(draft.totalEnLetras), valueColW - 0.2);
      doc.text(letraLines[0] ?? "", MARGIN_LEFT + labelColW + 0.1, y + 0.18);
      y += letraH;
      doc.setFontSize(10);
    }
    y += 0.15;
  }

  y = drawParagraph(doc, RESCISION_DESEMPENO_NO_INDEMNIZACION, MARGIN_LEFT, y, CONTENT_WIDTH, {
    fontSize: 9,
    fontStyle: "italic",
  });
  y += 0.2;

  // ── Section VII: ENTREGA-RECEPCIÓN DE MATERIALES Y ACCESOS ─────────
  y = ensureSpace(doc, y, 1.3);
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VII.  ENTREGA-RECEPCIÓN DE MATERIALES Y ACCESOS", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.15;

  y = drawParagraph(doc, RESCISION_DESEMPENO_ENTREGA_INTRO, MARGIN_LEFT, y, CONTENT_WIDTH);
  y += 0.1;

  doc.setFontSize(10);
  for (const bullet of RESCISION_DESEMPENO_ENTREGA_BULLETS) {
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
  y += 0.2;

  // ── Section VIII: ACUSE DE RECIBO + SIGNATURES ─────────────────────
  // Force a clean page for the acknowledgment + signature layout.
  doc.addPage();
  y = MARGIN_TOP;

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(10);
  doc.text("VIII.  ACUSE DE RECIBO", MARGIN_LEFT, y);
  y += 0.08;
  doc.line(MARGIN_LEFT, y, PAGE_WIDTH - MARGIN_RIGHT, y);
  y += 0.2;

  y = drawParagraph(doc, RESCISION_DESEMPENO_ACUSE, MARGIN_LEFT, y, CONTENT_WIDTH);
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

  // Confidential footer line at bottom of last page
  doc.setFont("Helvetica", "italic");
  doc.setFontSize(8);
  doc.text(
    "Documento confidencial · Recursos Humanos · Outsource Consulting Group S.A.S. · Guadalajara, Jalisco",
    PAGE_WIDTH / 2,
    10.3,
    { align: "center" },
  );

  drawFooters(doc, draft.docRef ?? "");

  return doc.output("blob");
}
