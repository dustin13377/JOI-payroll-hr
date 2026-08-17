export interface ParsedAttribution {
  // What the ad promised the applicant: the position= parameter prefilled on
  // the landing URL. Prefer first-touch, fall back to last-touch.
  ad_position: string | null;

  ft_source: string | null;
  ft_medium: string | null;
  ft_campaign: string | null;
  ft_content: string | null;
  ft_term: string | null;
  ft_channel: string | null;
  ft_placement: string | null;
  ft_landing: string | null;
  ft_query: string | null;

  lt_source: string | null;
  lt_medium: string | null;
  lt_campaign: string | null;
  lt_content: string | null;
  lt_term: string | null;
  lt_channel: string | null;
  lt_placement: string | null;
  lt_landing: string | null;
  lt_query: string | null;

  pageview_count: number | null;
  session_count: number | null;
  touch_path: string | null;
  time_to_conversion: string | null;

  // Any attribution-looking field the snippet sends that we have not given a
  // column to. Kept so a future snippet change is visible instead of silent.
  extra_fields: Record<string, string>;
}

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
  // Exact "Position you are applying for" value from the form, stored verbatim.
  // Unlike role_interest (a fixed 5-value enum), this accepts ANY role — so new
  // roles added via the Job Postings plugin are never dropped.
  //
  // NOTE: this is the applicant's DROPDOWN choice and is secondary for
  // reporting. It routinely disagrees with the ad they clicked. Report on
  // attribution.ad_position instead.
  applied_position: string | null;
  english_level_self: "C1" | "C2" | "below_c1" | "unknown";
  applicant_notes: string | null;
  cv_url: string | null; // Gravity Forms field-id=4 (PDF/DOCX)
  presentation_url: string | null; // Gravity Forms field-id=16 (audio or video)
  needs_manual_review: boolean; // true if no name or no phone
  parse_warnings: string[];
  attribution: ParsedAttribution;
}

// ---------------------------------------------------------------------------
// HTML utilities
// ---------------------------------------------------------------------------

/** Decode common HTML entities. &amp; must be decoded LAST so that
 * double-encoded input like "&amp;lt;" yields "&lt;" and not "<". */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
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

  const rows = html.split(/<\/tr>/i);

  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i];
    const labelMatch = row.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    if (!labelMatch) continue;

    const label = stripTags(labelMatch[1]).trim().toUpperCase();
    if (!label) continue;

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
  if (/^(native|nativo|c2)$/i.test(l)) return "C2";
  if (/^c1$/i.test(l)) return "C1";
  // Only actual CEFR codes below C1 (A1, A2, B1, B2). The old pattern was
  // /^[BA]/i, which wrongly classified "Advanced", "Bilingual", "Avanzado",
  // and "Básico... " free text as below_c1. Free text we can't grade stays
  // "unknown" so a human looks at it instead of the applicant being
  // silently filtered.
  if (/^[ab][12]\b/i.test(l)) return "below_c1";
  return "unknown";
}

/**
 * Normalize phone to E.164 (+52XXXXXXXXXX).
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
  if (hasLeadingPlus && digits.length >= 10) {
    warnings.push(
      `Unexpected phone digit count (${digits.length}): stored as +${digits}`,
    );
    return `+${digits}`;
  }

  warnings.push(`Could not normalize phone number: "${raw}"`);
  return raw.trim();
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

/**
 * The site attribution snippet adds hidden fields to both application forms
 * capturing first-touch and last-touch source data. Labels are title case
 * ("First Source", "Last Campaign"), unlike the applicant-facing fields which
 * are upper case. buildFieldMap upper-cases every key, so lookups here are
 * upper-cased too.
 *
 * These fields only exist on submissions after the snippet went live (roughly
 * 2026-07-17). Older emails parse to all-null attribution, which is expected,
 * not a bug. Do not attempt CPA analysis on submissions before that date.
 */
const ATTRIBUTION_LABELS = [
  "FIRST SOURCE",
  "FIRST MEDIUM",
  "FIRST CAMPAIGN",
  "FIRST CONTENT",
  "FIRST TERM",
  "FIRST CHANNEL",
  "FIRST PLACEMENT",
  "FIRST LANDING",
  "FIRST QUERY",
  "LAST SOURCE",
  "LAST MEDIUM",
  "LAST CAMPAIGN",
  "LAST CONTENT",
  "LAST TERM",
  "LAST CHANNEL",
  "LAST PLACEMENT",
  "LAST LANDING",
  "LAST QUERY",
  "PAGEVIEW COUNT",
  "SESSION COUNT",
  "TOUCH PATH",
  "TIME TO CONVERSION",
];

/**
 * Every applicant-facing field label on both forms. Anything here is applicant
 * data, never attribution, regardless of what prefix it happens to share with
 * the snippet's labels. Add to this list when a field is added to either form.
 */
const APPLICANT_FIELD_LABELS = new Set([
  "FIRST NAME",
  "LAST NAME",
  "NOMBRE COMPLETO",
  "APELLIDOS",
  "EMAIL",
  "CORREO ELECTRÓNICO",
  "CURP",
  "WHATSAPP NUMBER",
  "NÚMERO WHATSAPP",
  "POSITION YOU ARE APPLYING FOR",
  "VACANTE A LA QUE DESEA POSTULARSE",
  "ENGLISH LEVEL",
  "NIVEL DE INGLÉS",
  "CURRICULUM VITAE",
  "PRESENTATION",
  "PRESENTACIÓN",
  "LAST COMPANY YOU WORKED FOR",
  "ÚLTIMA COMPAÑÍA PARA LA QUE TRABAJÓ",
  "LENGTH OF EMPLOYMENT",
  "TIEMPO DE ANTIGÜEDAD",
  "REASON FOR LEAVING",
  "MOTIVO DE BAJA",
  "COMMUTE TIME",
  "TIEMPO DE TRASLADO",
  "SALARY EXPECTATION",
  "EXPECTATIVA SALARIAL",
  "AVAILABLE START DATE",
  "DISPONIBILIDAD PARA COMENZAR",
]);

/** Pull a single parameter out of a captured query string.
 * The (^|[?&]) prefix is MANDATORY so `position` cannot substring-match a
 * longer parameter name like `ad_position`. Param name is escaped so a future
 * caller passing a name containing regex metacharacters doesn't silently
 * change the pattern. */
function queryParam(queryString: string | null, param: string): string | null {
  if (!queryString) return null;
  const escaped = param.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = queryString.match(new RegExp(`(?:^|[?&])${escaped}=([^&]*)`));
  if (!m) return null;
  const raw = m[1].replace(/\+/g, " ");
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding: keep the plus-decoded form rather than lose
    // the value entirely.
  }
  return decoded.trim() || null;
}

function parseIntOrNull(v: string | null): number | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function parseAttribution(map: Map<string, string>): ParsedAttribution {
  const g = (label: string) => getValue(map, label);

  const ft_query = g("First Query");
  const lt_query = g("Last Query");

  // Collect any attribution-shaped field we do not have a column for, so a
  // change to the snippet shows up in the data instead of vanishing.
  //
  // The exclusion list must name every APPLICANT field, both form languages,
  // because the FIRST/LAST prefix heuristic alone collides with real
  // applicant labels: "LAST COMPANY YOU WORKED FOR" starts with "LAST " and
  // an earlier version of this code copied applicant PII (employer names)
  // into the attribution JSON on every English submission because of it.
  const extra_fields: Record<string, string> = {};
  for (const [label, rawRow] of map.entries()) {
    const looksAttribution =
      label.startsWith("FIRST ") ||
      label.startsWith("LAST ") ||
      label.endsWith(" COUNT") ||
      label === "TOUCH PATH" ||
      label === "TIME TO CONVERSION";
    if (!looksAttribution) continue;
    if (ATTRIBUTION_LABELS.includes(label)) continue;
    if (APPLICANT_FIELD_LABELS.has(label)) continue;
    const text = stripTags(rawRow).trim();
    if (text) extra_fields[label] = text;
  }

  return {
    ad_position:
      queryParam(ft_query, "position") ?? queryParam(lt_query, "position"),

    ft_source: g("First Source"),
    ft_medium: g("First Medium"),
    ft_campaign: g("First Campaign"),
    ft_content: g("First Content"),
    ft_term: g("First Term"),
    ft_channel: g("First Channel"),
    ft_placement: g("First Placement"),
    ft_landing: g("First Landing"),
    ft_query,

    lt_source: g("Last Source"),
    lt_medium: g("Last Medium"),
    lt_campaign: g("Last Campaign"),
    lt_content: g("Last Content"),
    lt_term: g("Last Term"),
    lt_channel: g("Last Channel"),
    lt_placement: g("Last Placement"),
    lt_landing: g("Last Landing"),
    lt_query,

    pageview_count: parseIntOrNull(g("Pageview Count")),
    session_count: parseIntOrNull(g("Session Count")),
    touch_path: g("Touch Path"),
    time_to_conversion: g("Time To Conversion"),

    extra_fields,
  };
}

// ---------------------------------------------------------------------------
// applicant_notes builder
// ---------------------------------------------------------------------------

function buildNotes(map: Map<string, string>): string | null {
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
  const firstName = getValue(map, "FIRST NAME", "NOMBRE COMPLETO");
  const lastName = getValue(map, "LAST NAME", "APELLIDOS");
  // Guard against the Spanish form: NOMBRE COMPLETO is the FULL name, so if
  // it already ends with APELLIDOS, concatenating would duplicate the
  // surname ("Juan Pérez García Pérez García").
  const full_name =
    firstName && lastName
      ? firstName.toLowerCase().endsWith(lastName.toLowerCase())
        ? firstName.trim()
        : `${firstName} ${lastName}`.trim()
      : (firstName ?? lastName ?? null);

  const curp = getValue(map, "CURP");

  let email = getValue(map, "EMAIL", "CORREO ELECTRÓNICO");
  if (!email) {
    const mailto = getHref(map, "EMAIL", "CORREO ELECTRÓNICO");
    if (mailto?.toLowerCase().startsWith("mailto:")) {
      email = mailto.slice("mailto:".length).trim() || null;
    }
  }
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
  const applied_position =
    position && position.trim() !== "Open" ? position.trim() : null;
  const role_interest = mapRoleInterest(position, warnings);

  const englishRaw = getValue(map, "ENGLISH LEVEL", "NIVEL DE INGLÉS");
  const english_level_self = mapEnglishLevel(englishRaw);

  // --- Link fields ---
  const cv_url = getHref(map, "CURRICULUM VITAE");
  const presentation_url = getHref(map, "PRESENTATION", "PRESENTACIÓN");

  // --- Notes ---
  const applicant_notes = buildNotes(map);

  // --- Attribution ---
  const attribution = parseAttribution(map);

  // Surface the ad/dropdown disagreement as a warning so it is visible in
  // logs and in parse_warnings, rather than only showing up as a number that
  // does not match the agency's. Compared case- and whitespace-insensitively
  // so formatting drift between the ad URL and the dropdown option text does
  // not produce false mismatches.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if (
    attribution.ad_position &&
    applied_position &&
    norm(attribution.ad_position) !== norm(applied_position)
  ) {
    warnings.push(
      `Ad promised "${attribution.ad_position}" but applicant selected "${applied_position}".`,
    );
  }

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
    applied_position,
    english_level_self,
    applicant_notes,
    cv_url,
    presentation_url,
    needs_manual_review,
    parse_warnings: warnings,
    attribution,
  };
}
