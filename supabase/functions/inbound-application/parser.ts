export interface ParsedApplication {
  full_name: string | null;
  curp: string | null;
  phone: string | null; // E.164, e.g. "+526674241679"
  role_interest:
    | "b2b_setter"
    | "funding_activation"
    | "customer_reactivation"
    | null;
  english_level_self: "C1" | "C2" | "below_c1" | "unknown";
  applicant_notes: string | null;
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

/** Get plain-text value for a label from the field map. */
function getValue(map: Map<string, string>, label: string): string | null {
  const raw = map.get(label.toUpperCase());
  if (raw == null) return null;
  const text = stripTags(raw).trim();
  return text || null;
}

/**
 * Get the href URL for a label whose value is an <a> link.
 * Decodes &amp; entities so the stored URL is valid.
 */
function getHref(map: Map<string, string>, label: string): string | null {
  const raw = map.get(label.toUpperCase());
  if (raw == null) return null;
  return extractHref(raw);
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

function buildNotes(
  map: Map<string, string>,
  cvUrl: string | null,
  presentationUrl: string | null,
): string | null {
  const lines: string[] = [];

  const add = (label: string, key: string) => {
    const v = getValue(map, key);
    if (v) lines.push(`${label}: ${v}`);
  };

  add("Last company", "LAST COMPANY YOU WORKED FOR");
  add("Length of employment", "LENGTH OF EMPLOYMENT");
  add("Reason for leaving", "REASON FOR LEAVING");
  add("Commute time", "COMMUTE TIME");
  add("Salary expectation", "SALARY EXPECTATION");
  add("Available start date", "AVAILABLE START DATE");

  if (cvUrl) lines.push(`CV: ${cvUrl}`);
  if (presentationUrl) lines.push(`Presentation: ${presentationUrl}`);

  return lines.length > 0 ? lines.join("\n") : null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseApplicationEmail(htmlBody: string): ParsedApplication {
  const warnings: string[] = [];

  const map = buildFieldMap(htmlBody);

  // --- Basic fields ---
  const firstName = getValue(map, "FIRST NAME");
  const lastName = getValue(map, "LAST NAME");
  const full_name =
    firstName && lastName
      ? `${firstName} ${lastName}`.trim()
      : (firstName ?? lastName ?? null);

  const curp = getValue(map, "CURP");

  const rawPhone = getValue(map, "WHATSAPP NUMBER");
  const phone = normalizePhone(rawPhone, warnings);

  const position = getValue(map, "POSITION YOU ARE APPLYING FOR");
  const role_interest = mapRoleInterest(position, warnings);

  const englishRaw = getValue(map, "ENGLISH LEVEL");
  const english_level_self = mapEnglishLevel(englishRaw);

  // --- Link fields ---
  const cvUrl = getHref(map, "CURRICULUM VITAE");
  const presentationUrl = getHref(map, "PRESENTATION");

  // --- Notes ---
  const applicant_notes = buildNotes(map, cvUrl, presentationUrl);

  // --- Manual review flag ---
  if (!full_name) warnings.push("Could not extract applicant name.");
  if (!phone) warnings.push("Could not extract phone number.");
  const needs_manual_review = !full_name || !phone;

  return {
    full_name,
    curp,
    phone,
    role_interest,
    english_level_self,
    applicant_notes,
    needs_manual_review,
    parse_warnings: warnings,
  };
}
