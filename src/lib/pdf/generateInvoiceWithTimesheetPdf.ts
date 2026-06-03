/**
 * Generate a single PDF containing:
 *  1. The invoice (one or more pages) — mirrors what FacturaDetalle shows
 *     on-screen, with the US billing address and American long-form dates.
 *  2. A timesheet section per punch-billed agent — Date / Clock In / Clock Out
 *     / Hours. Flat-billed agents (e.g. Jose Guadalupe) are listed with a
 *     "Flat weekly bill — no daily punches" note. Misc lines (employee_id
 *     null) are excluded from the timesheet.
 *
 * The PDF is downloaded directly via `doc.save(filename)`.
 */

import {
  createDoc,
  ensureSpace,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  MARGIN_BOTTOM,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  CONTENT_WIDTH,
} from "./pdfHelpers";
import { formatDateUSLong } from "@/lib/localDate";
import type { Invoice, InvoiceLine, InvoicePunch, Client } from "@/hooks/useInvoices";

// Right edge of the printable area. All right-aligned columns and rules
// anchor to this so nothing overflows the page margin.
const RIGHT_EDGE = PAGE_WIDTH - MARGIN_RIGHT;

const BILL_FROM_LINES = [
  "JOI",
  "5965 S 900 E, #300",
  "Murray, UT 84121",
];

function fmtUSD(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

// "12:50 PM" in the client's local time zone. Punches are stored as
// timestamps with timezone — we want the time of day as the user would
// have entered/seen it. Using the browser's locale here is a reasonable
// default; punches are entered in MX time so the rendering matches.
function fmtClockTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDateUS(iso: string): string {
  // For the per-day timesheet rows we want a compact format ("May 18, 2026"
  // is fine — same as the invoice header).
  return formatDateUSLong(iso);
}

// ── Footer (clean English version, no Spanish "Página") ──────────────
function drawFooters(doc: ReturnType<typeof createDoc>, invoiceNumber: string) {
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${invoiceNumber}`,
      MARGIN_LEFT,
      PAGE_HEIGHT - 0.5,
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      RIGHT_EDGE,
      PAGE_HEIGHT - 0.5,
      { align: "right" },
    );
    doc.setTextColor(0, 0, 0);
  }
}

// ── Section 1: Invoice page ──────────────────────────────────────────
// Returns the Y position just below the Grand Total so the caller can
// decide whether the timesheet fits on the same page.
function drawInvoicePage(
  doc: ReturnType<typeof createDoc>,
  invoice: Invoice & { lines: InvoiceLine[]; client?: Client },
): number {
  let y = MARGIN_TOP;

  // Title block — INVOICE / number on left, week info on right.
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(212, 130, 24); // matches on-screen primary (orange)
  doc.text("INVOICE", MARGIN_LEFT, y + 0.25);
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(14);
  doc.text(invoice.invoice_number, MARGIN_LEFT, y + 0.55);

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text(`Week ${invoice.week_number}`, RIGHT_EDGE, y + 0.2, { align: "right" });
  doc.text(
    `${formatDateUSLong(invoice.week_start)} — ${formatDateUSLong(invoice.week_end)}`,
    RIGHT_EDGE,
    y + 0.4,
    { align: "right" },
  );
  doc.setFont("Helvetica", "bold");
  doc.text(`Due: ${formatDateUSLong(invoice.due_date)}`, RIGHT_EDGE, y + 0.6, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("Helvetica", "normal");

  y += 1.0;

  // Bill From / Bill To
  const col2X = MARGIN_LEFT + CONTENT_WIDTH / 2;
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.setFont("Helvetica", "bold");
  doc.text("BILL FROM", MARGIN_LEFT, y);
  doc.text("BILL TO", col2X, y);
  doc.setTextColor(0, 0, 0);
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);

  let leftY = y + 0.2;
  for (const ln of BILL_FROM_LINES) {
    doc.text(ln, MARGIN_LEFT, leftY);
    leftY += 0.18;
  }

  let rightY = y + 0.2;
  doc.setFont("Helvetica", "bold");
  doc.text(invoice.client?.bill_to_name || invoice.client?.name || "—", col2X, rightY);
  rightY += 0.18;
  doc.setFont("Helvetica", "normal");
  const billToAddr = invoice.client?.bill_to_address || "";
  for (const ln of billToAddr.split("\n")) {
    if (!ln.trim()) continue;
    doc.text(ln, col2X, rightY);
    rightY += 0.18;
  }

  y = Math.max(leftY, rightY) + 0.25;

  // Separator
  doc.setLineWidth(0.005);
  doc.line(MARGIN_LEFT, y, RIGHT_EDGE, y);
  y += 0.2;

  // Lines table — right-anchored so Total Price lands exactly at the right
  // margin and nothing overflows. `width` for right-aligned cols is just the
  // wrap-width hint; text right-edge = c.x + c.width.
  const cols = [
    { label: "Agent",       x: MARGIN_LEFT, align: "left" as const,  width: 3.0 },  // wraps at 3.75
    { label: "Days",        x: 3.45,        align: "right" as const, width: 0.4 },  // ends 3.85
    { label: "Unit Price",  x: 3.95,        align: "right" as const, width: 0.9 },  // ends 4.85
    { label: "Total",       x: 4.85,        align: "right" as const, width: 0.9 },  // ends 5.75
    { label: "Spiffs",      x: 5.85,        align: "right" as const, width: 0.7 },  // ends 6.55
    { label: "Total Price", x: 6.65,        align: "right" as const, width: 1.1 },  // ends 7.75 = RIGHT_EDGE
  ];

  // Header row
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(9);
  for (const c of cols) {
    const tx = c.align === "right" ? c.x + c.width : c.x;
    doc.text(c.label, tx, y, { align: c.align });
  }
  y += 0.1;
  doc.setLineWidth(0.005);
  doc.line(MARGIN_LEFT, y, RIGHT_EDGE, y);
  y += 0.15;

  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);

  for (const line of invoice.lines) {
    y = ensureSpace(doc, y, 0.25);
    const isFlat = line.is_flat_total;

    // Agent name — wrap if too long
    const nameLines: string[] = doc.splitTextToSize(line.agent_name, cols[0].width - 0.1);
    let nameY = y;
    for (const nl of nameLines) {
      doc.text(nl, cols[0].x, nameY);
      nameY += 0.16;
    }

    const rowEndY = nameY;

    const draw = (text: string, col: typeof cols[0]) => {
      const tx = col.align === "right" ? col.x + col.width : col.x;
      doc.text(text, tx, y, { align: col.align });
    };

    draw(isFlat ? "—" : String(Number(line.days_worked)), cols[1]);
    draw(isFlat ? "—" : fmtUSD(Number(line.unit_price)), cols[2]);
    draw(isFlat ? "—" : fmtUSD(Number(line.total)), cols[3]);
    draw(isFlat ? "—" : fmtUSD(Number(line.spiffs)), cols[4]);

    doc.setFont("Helvetica", "bold");
    draw(fmtUSD(Number(line.total_price)), cols[5]);
    doc.setFont("Helvetica", "normal");

    y = Math.max(rowEndY, y + 0.18);

    // Light row separator
    doc.setDrawColor(220, 220, 220);
    doc.line(MARGIN_LEFT, y, RIGHT_EDGE, y);
    doc.setDrawColor(0, 0, 0);
    y += 0.12;
  }

  // Grand total — right side
  y += 0.2;
  y = ensureSpace(doc, y, 0.6);
  const grandTotal = invoice.lines.reduce((s, l) => s + Number(l.total_price), 0);

  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text("Grand Total", RIGHT_EDGE, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 0.3;
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(212, 130, 24);
  doc.text(fmtUSD(grandTotal), RIGHT_EDGE, y, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFont("Helvetica", "normal");

  return y;
}

// ── Section 2: Timesheet pages (one section per punch-billed agent) ──
function drawTimesheets(
  doc: ReturnType<typeof createDoc>,
  invoice: Invoice & { lines: InvoiceLine[]; client?: Client },
  punchesByEmployee: Map<string, InvoicePunch[]>,
  invoiceEndY: number,
): void {
  // Try to fit the timesheet on the same page as the invoice. Only add a new
  // page if there isn't room for the section header + at least one agent
  // block (~2.2" minimum for a 5-day agent + spacing). Saves a whole page
  // for small invoices like SCOOP (4 agents).
  const MIN_TIMESHEET_SPACE = 2.2;
  let y: number;
  if (invoiceEndY + 0.5 + MIN_TIMESHEET_SPACE <= PAGE_HEIGHT - MARGIN_BOTTOM) {
    y = invoiceEndY + 0.5; // gap between Grand Total and Timesheet header
  } else {
    doc.addPage();
    y = MARGIN_TOP;
  }

  // Section header
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Timesheet", MARGIN_LEFT, y);
  y += 0.3;
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Week ${invoice.week_number}: ${formatDateUSLong(invoice.week_start)} — ${formatDateUSLong(invoice.week_end)}`,
    MARGIN_LEFT,
    y,
  );
  doc.setTextColor(0, 0, 0);
  y += 0.35;

  // Sort agents in the order they appear on the invoice. Skip misc lines
  // (no employee_id) entirely.
  const agentLines = invoice.lines.filter((l) => l.employee_id !== null);

  if (agentLines.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(110, 110, 110);
    doc.text("No agent lines on this invoice.", MARGIN_LEFT, y);
    return;
  }

  for (const line of agentLines) {
    // Agent header
    y = ensureSpace(doc, y, 0.8);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text(line.agent_name, MARGIN_LEFT, y);
    if (line.campaign_name) {
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text(`— ${line.campaign_name}`, MARGIN_LEFT + 2.5, y);
      doc.setTextColor(0, 0, 0);
    }
    y += 0.2;

    if (line.is_flat_total) {
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(110, 110, 110);
      doc.text("Flat weekly bill — no daily punches.", MARGIN_LEFT + 0.1, y + 0.05);
      doc.setTextColor(0, 0, 0);
      doc.setFont("Helvetica", "normal");
      y += 0.35;
      continue;
    }

    const punches = punchesByEmployee.get(line.employee_id!) ?? [];

    // Sub-header for the invoice-vs-punches discrepancy if any
    const distinctPunchDates = new Set(punches.map((p) => p.date)).size;
    const invoiceDays = Number(line.days_worked);
    if (distinctPunchDates !== invoiceDays) {
      doc.setFont("Helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(180, 80, 0);
      doc.text(
        `Invoice billed ${invoiceDays} day${invoiceDays === 1 ? "" : "s"}; ${distinctPunchDates} punch day${distinctPunchDates === 1 ? "" : "s"} found.`,
        MARGIN_LEFT + 0.1,
        y + 0.05,
      );
      doc.setTextColor(0, 0, 0);
      doc.setFont("Helvetica", "normal");
      y += 0.2;
    }

    // Table header — same right-anchor pattern as the invoice table.
    // Hours right-edge lands at RIGHT_EDGE (7.75").
    const tCols = [
      { label: "Date",      x: MARGIN_LEFT, align: "left" as const,  width: 1.6 },  // 0.75 → 2.35
      { label: "Clock In",  x: 2.6,         align: "left" as const,  width: 1.4 },  // 2.6 → 4.0
      { label: "Clock Out", x: 4.4,         align: "left" as const,  width: 1.4 },  // 4.4 → 5.8
      { label: "Hours",     x: 6.75,        align: "right" as const, width: 1.0 },  // ends 7.75
    ];

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    for (const c of tCols) {
      const tx = c.align === "right" ? c.x + c.width : c.x;
      doc.text(c.label, tx, y, { align: c.align });
    }
    y += 0.08;
    doc.setLineWidth(0.005);
    doc.line(MARGIN_LEFT, y, RIGHT_EDGE, y);
    y += 0.14;
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);

    if (punches.length === 0) {
      doc.setFont("Helvetica", "italic");
      doc.setTextColor(140, 30, 30);
      doc.text("No punches recorded for this week.", MARGIN_LEFT + 0.1, y);
      doc.setTextColor(0, 0, 0);
      doc.setFont("Helvetica", "normal");
      y += 0.25;
    } else {
      // Group punches by date so multiple punches in one day show as one row.
      // For now we show each punch as its own row — if an agent clocked in/out
      // twice in one day (e.g. lunch break punches), the day has two rows. This
      // is more faithful than collapsing them and lets the client see the gaps.
      let hoursTotal = 0;
      for (const p of punches) {
        y = ensureSpace(doc, y, 0.2);
        const drawRow = (text: string, col: typeof tCols[0]) => {
          const tx = col.align === "right" ? col.x + col.width : col.x;
          doc.text(text, tx, y, { align: col.align });
        };
        drawRow(fmtDateUS(p.date), tCols[0]);
        drawRow(fmtClockTime(p.clock_in), tCols[1]);
        drawRow(fmtClockTime(p.clock_out), tCols[2]);
        const hrs = Number(p.total_hours ?? 0);
        hoursTotal += hrs;
        drawRow(hrs > 0 ? hrs.toFixed(2) : "—", tCols[3]);
        y += 0.18;
      }
      // Subtotal row
      doc.setLineWidth(0.005);
      doc.line(MARGIN_LEFT, y - 0.05, RIGHT_EDGE, y - 0.05);
      doc.setFont("Helvetica", "bold");
      doc.text(
        `Total — ${distinctPunchDates} day${distinctPunchDates === 1 ? "" : "s"}`,
        MARGIN_LEFT,
        y + 0.12,
      );
      doc.text(hoursTotal.toFixed(2), RIGHT_EDGE, y + 0.12, { align: "right" });
      doc.setFont("Helvetica", "normal");
      y += 0.35;
    }

    y += 0.15;
  }
}

// Parse a YYYY-MM-DD string to "M-D" without time zone games.
function fmtShortDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}-${d}`;
}

// Strip filesystem-unsafe characters from the client name so the download
// filename works across browsers/OSes. Replaces / \ : * ? " < > | with a space
// and collapses repeats.
function sanitizeForFilename(s: string): string {
  return s.replace(/[\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

// Build the invoice PDF filename: "<Client> Invoice <M-D> to <M-D>.pdf"
// e.g. "Torro Invoice 5-18 to 5-24.pdf". Falls back to the invoice number
// when the client name isn't available.
function buildInvoiceFilename(
  invoice: Invoice & { client?: Client },
): string {
  const clientName = invoice.client?.name
    ? sanitizeForFilename(invoice.client.name)
    : null;
  if (!clientName || !invoice.week_start || !invoice.week_end) {
    return `${invoice.invoice_number}.pdf`;
  }
  const start = fmtShortDate(invoice.week_start);
  const end = fmtShortDate(invoice.week_end);
  return `${clientName} Invoice ${start} to ${end}.pdf`;
}

// ── Public entry point ──────────────────────────────────────────────
export function generateInvoiceWithTimesheetPdf(
  invoice: Invoice & { lines: InvoiceLine[]; client?: Client },
  punchesByEmployee: Map<string, InvoicePunch[]>,
): void {
  const doc = createDoc();
  const invoiceEndY = drawInvoicePage(doc, invoice);
  drawTimesheets(doc, invoice, punchesByEmployee, invoiceEndY);
  drawFooters(doc, invoice.invoice_number);
  doc.save(buildInvoiceFilename(invoice));
}
