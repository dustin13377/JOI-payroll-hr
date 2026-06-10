export interface ParsedApplication {
  full_name: string | null;
  curp: string | null;
  email: string | null;
  phone: string | null; // E.164, e.g. "+526674241679"
  role_interest:
    | "b2b_setter"
    | "funding_activation"
    | "customer_reactivation"
    | "ai_automation"
    | "ai_operations"
    | null;
  english_level_self: "C1" | "C2" | "below_c1" | "unknown";
  applicant_notes: string | null;
  cv_url: string | null; // Gravity Forms field-id=4 (PDF/DOCX)
  presentation_url: string | null; // Gravity Forms field-id=16 (audio or video)
  needs_manual_review: boolean; // true if no name or no phone
  parse_warnings: string[];
}

// ---------------------------------------------------------------------------
// HTML utilities
// ---------------------------------------------------------------------------

/** Decode common HTML entities. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}

/** Strip all HTML tags and decode entities, collapsing whitespace. */
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Extract href from an <a> element string (handles both single- and
 * double-quoted href attributes, and &amp; entity in the URL).
 */
function extractHref(s: string): string | null {
  const m = s.match(/href=['"]([^'"]+)['"]/i);
  if (!m) return null;
  return decodeEntities(m[1]);
}

// ---------------------------------------------------------------------------
// Core label→value extraction
// ---------------------------------------------------------------------------

/**
 * Build a map of label → raw inner HTML of the value cell.
 *
 * The Gravity Forms email renders each field as two consecutive <tr> blocks:
 *   <tr bgcolor="#EAF2FA"> ... <strong>LABEL</strong> ... </tr>
 *   <tr bgcolor="#FFFFFF"> ... value content ... </tr>
 *
 * For robustness we also handle the compact synthetic test snippets used by
 * the unit tests, which look like:
 *   <strong>LABEL</strong>...</tr><tr>...<font>VALUE</font>
 */
function buildFieldMap(html: string): Map<string, string> {
  const map = new Map<string, string>();

  // Strategy: split on </tr> boundaries, scan for a <strong>LABEL</strong>
  // row, then take the text content of the immediately following row.
  const rows = html.split(/<\/tr>/i);

  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i];
    // Does this row contain a <strong>…</strong> that looks like a label?
    const labelMatch = row.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    if (!labelMatch) continue;

    const label = stripTags(labelMatch[1]).trim().toUpperCase();
    if (!label) continue;

    // The value lives in the next row — grab its raw HTML.
    const valueRow = rows[i + 1];

    map.set(label, valueRow);
  }

  return map;
}

/**
 * Get plain-text value for a label from the field map.
 * Accepts multiple label aliases (English + Spanish forms) — first hit wins.
 */
function getValue(
  map: Map<string, string>,
  ...labels: string[]
): string | null {
  for (const label of labels) {
    const raw = map.get(label.toUpperCase());
    if (raw == null) continue;
    const text = stripTags(raw).trim();
    if (text) return text;
  }
  return null;
}

/**
 * Get the href URL for a label whose value is an <a> link.
 * Decodes &amp; entities so the stored URL is valid.
 * Accepts multiple label aliases (English + Spanish forms) — first hit wins.
 */
function getHref(map: Map<string, string>, ...labels: string[]): string | null {
  for (const label of labels) {
    const raw = map.get(label.toUpperCase());
    if (raw == null) continue;
    const href = extractHref(raw);
    if (href) return href;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapRoleInterest(
  position: string | null,
  warnings: string[],
): ParsedApplication["role_interest"] {
  if (!position) return null;
  const p = position.trim();
  if (p === "B2B Appointment Setter") return "b2b_setter";
  if (p === "Funding Application Activation Specialist") {
    return "funding_activation";
  }
  if (p === "Customer Reactivation Specialist") return "customer_reactivation";
  if (p === "Open") return null; // intentional — goes to raw_email_body
  // Dropdown options (added to both forms 2026-06-10) and free-text answers
  // are matched loosely. Note: the English "Funding Activation," option has a
  // trailing comma in its value — contains-matching absorbs it.
  const low = p.toLowerCase();
  if (low.includes("ai automation")) return "ai_automation";
  if (low.includes("ai operations")) return "ai_operations";
  if (low.includes("funding")) return "funding_activation";
  if (low.includes("b2b")) return "b2b_setter";
  if (low.includes("reactivation")) return "customer_reactivation";
  warnings.push(`Unrecognized position value: "${p}"`);
  return null;
}

function mapEnglishLevel(
  level: string | null,
): ParsedApplication["english_level_self"] {
  if (!level) return "unknown";
  const l = level.trim();
  if (l === "Native" || l === "C2") return "C2";
  if (l === "C1") return "C1";
  if (/^[BA]/i.test(l)) return "below_c1";
  return "unknown";
}

/**
 * Normalize phone to E.164 (+52XXXXXXXXXX).
 *
 * Rules:
 * 1. Strip all non-digit characters (except leading + which we note first).
 * 2. If the result is 10 digits → prepend +52.
 * 3. If the result is 12 digits and starts with "52" → prepend +.
 * 4. Otherwise → store as-is with warning.
 */
function normalizePhone(
  raw: string | null,
  warnings: string[],
): string | null {
  if (!raw) return null;

  const hasLeadingPlus = raw.trimStart().startsWith("+");
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+52${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("52")) {
    return `+${digits}`;
  }
  // If the original had a leading + and the digit count is reasonable, keep it.
  if (hasLeadingPlus && digits.length >= 10) {
    // Already formatted — just re-attach the +
    warnings.push(
      `Unexpected phone digit count (${digits.length}): stored as +${digits}`,
    );
    return `+${digits}`;
  }

  warnings.push(`Could not normalize phone number: "${raw}"`);
  return raw.trim();
}

// ---------------------------------------------------------------------------
// applicant_notes builder
// ---------------------------------------------------------------------------

function buildNotes(map: Map<string, string>): string | null {
  // Note: CV and Presentation URLs are stored in their own columns
  // (cv_url, presentation_url), not stuffed into the notes blob.
  const lines: string[] = [];

  const add = (label: string, ...keys: string[]) => {
    const v = getValue(map, ...keys);
    if (v) lines.push(`${label}: ${v}`);
  };

  add(
    "Last company",
    "LAST COMPANY YOU WORKED FOR",
    "ÚLTIMA COMPAÑÍA PARA LA QUE TRABAJÓ",
  );
  add("Length of employment", "LENGTH OF EMPLOYMENT", "TIEMPO DE ANTIGÜEDAD");
  add("Reason for leaving", "REASON FOR LEAVING", "MOTIVO DE BAJA");
  add("Commute time", "COMMUTE TIME", "TIEMPO DE TRASLADO");
  add("Salary expectation", "SALARY EXPECTATION", "EXPECTATIVA SALARIAL");
  add(
    "Available start date",
    "AVAILABLE START DATE",
    "DISPONIBILIDAD PARA COMENZAR",
  );

  return lines.length > 0 ? lines.join("\n") : null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseApplicationEmail(htmlBody: string): ParsedApplication {
  const warnings: string[] = [];

  const map = buildFieldMap(htmlBody);

  // --- Basic fields ---
  // English form: FIRST NAME / LAST NAME.
  // Spanish form: NOMBRE COMPLETO / APELLIDOS.
  const firstName = getValue(map, "FIRST NAME", "NOMBRE COMPLETO");
  const lastName = getValue(map, "LAST NAME", "APELLIDOS");
  const full_name =
    firstName && lastName
      ? `${firstName} ${lastName}`.trim()
      : (firstName ?? lastName ?? null);

  const curp = getValue(map, "CURP");

  // Both forms render the applicant email as an "Email" field whose value is
  // a mailto: link. Prefer the visible text; fall back to the mailto href.
  let email = getValue(map, "EMAIL", "CORREO ELECTRÓNICO");
  if (!email) {
    const mailto = getHref(map, "EMAIL", "CORREO ELECTRÓNICO");
    if (mailto?.toLowerCase().startsWith("mailto:")) {
      email = mailto.slice("mailto:".length).trim() || null;
    }
  }
  // Basic sanity check so junk never lands in the email column.
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warnings.push(`Discarded invalid email value: "${email}"`);
    email = null;
  }

  const rawPhone = getValue(map, "WHATSAPP NUMBER", "NÚMERO WHATSAPP");
  const phone = normalizePhone(rawPhone, warnings);

  const position = getValue(
    map,
    "POSITION YOU ARE APPLYING FOR",
    "VACANTE A LA QUE DESEA POSTULARSE",
  );
  const role_interest = mapRoleInterest(position, warnings);

  const englishRaw = getValue(map, "ENGLISH LEVEL", "NIVEL DE INGLÉS");
  const english_level_self = mapEnglishLevel(englishRaw);

  // --- Link fields ---
  const cv_url = getHref(map, "CURRICULUM VITAE");
  const presentation_url = getHref(map, "PRESENTATION", "PRESENTACIÓN");

  // --- Notes ---
  const applicant_notes = buildNotes(map);

  // --- Manual review flag ---
  if (!full_name) warnings.push("Could not extract applicant name.");
  if (!phone) warnings.push("Could not extract phone number.");
  const needs_manual_review = !full_name || !phone;

  return {
    full_name,
    curp,
    email,
    phone,
    role_interest,
    english_level_self,
    applicant_notes,
    cv_url,
    presentation_url,
    needs_manual_review,
    parse_warnings: warnings,
  };
}
