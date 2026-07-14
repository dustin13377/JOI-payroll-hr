// WhatsApp interview-invite helpers (Path A: one-tap manual send via wa.me).
//
// We do NOT send through any API here. Clicking the button builds a wa.me
// deep link and opens it; the recruiter taps send inside WhatsApp. This needs
// no Meta Business API, no approved templates, and costs nothing. The trade-off
// is that a human taps send and the message goes from whatever WhatsApp account
// is on that device.

// Interview booking link sent to candidates. Now a Google Calendar
// appointment-schedule link (was Calendly); constant name kept to avoid
// churning importers.
export const CALENDLY_INTERVIEW_URL =
  "https://calendar.app.google/nw7EubnaE3gGhaaS8";

/** Template key recorded on the recruiting_messages row for this message type. */
export const INTERVIEW_INVITE_TEMPLATE_KEY = "interview_invite_whatsapp";

/** Template key for a second-touch nudge to a candidate who went quiet. */
export const INTERVIEW_FOLLOWUP_TEMPLATE_KEY = "interview_followup_whatsapp";

/**
 * Normalize a phone number to digits-only with a country code, which is what
 * wa.me expects (no +, spaces, or dashes). Candidates are mostly local (MX) but
 * some apply with US or other international numbers, so we respect an explicit
 * country code when one is present and only assume Mexico for a bare local
 * 10-digit number.
 *
 * Handles the common shapes we see in applications:
 *   - "33 1234 5678"        (bare MX local)          -> 523312345678
 *   - "+52 33 1234 5678"    (MX with code)           -> 523312345678
 *   - "+52 1 33 1234 5678"  (old MX mobile "1")       -> 523312345678
 *   - "001 470 908 1189"    (US, 00 intl prefix)      -> 14709081189
 *   - "+1 470 908 1189"     (US with +)               -> 14709081189
 *   - "14709081189"         (US with country code)    -> 14709081189
 *
 * Returns null if we can't produce something plausible, so the caller can
 * disable the button rather than open WhatsApp to a broken contact.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // "00" international exit prefix (e.g. 001 470… ) — strip it; what remains
  // already starts with a country code, same as a leading "+".
  let hadExplicitCode = hadPlus;
  if (!hadPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
    hadExplicitCode = true;
  }

  // Old Mexican mobile format: 52 + 1 + 10 digits -> drop the legacy 1.
  if (digits.length === 13 && digits.startsWith("521")) {
    return "52" + digits.slice(3);
  }

  // MX with country code: 52 + 10 digits.
  if (digits.length === 12 && digits.startsWith("52")) {
    return digits;
  }

  // US/Canada with country code: 1 + 10 digits.
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits;
  }

  // Bare 10-digit local number with no explicit code -> assume Mexico.
  if (digits.length === 10 && !hadExplicitCode) {
    return "52" + digits;
  }

  // Otherwise trust it if it already carries a country code (via + or 00) and
  // is a plausible international length.
  if (hadExplicitCode && digits.length >= 8 && digits.length <= 15) {
    return digits;
  }

  return null;
}

/**
 * Full name, whitespace-collapsed. Falls back to empty string.
 */
function greetingName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  return fullName.trim().replace(/\s+/g, " ");
}

/**
 * First name only, for a warmer, less form-letter greeting. A message that
 * opens "Hola Adam," reads more personal than "Hola Adam Rodriguez," and tends
 * to get more replies. Falls back to empty string when we have no name.
 * Exported so the email template greets the same way.
 */
export function firstName(fullName: string | null | undefined): string {
  const full = greetingName(fullName);
  return full ? full.split(" ")[0] : "";
}

/**
 * Spanish interview-invite message (first contact) with the booking link.
 * Opens with a reason to reply and a clear action, not just a thank-you.
 * Greeting adapts gracefully when we don't have a name.
 */
export function buildInterviewInviteMessage(
  fullName: string | null | undefined,
): string {
  const name = firstName(fullName);
  const greeting = name ? `Hola ${name},` : "Hola,";
  return (
    `${greeting} te escribo de JOI 👋 Vimos tu solicitud y nos gustaría ` +
    `platicar contigo sobre la vacante. ¿Agendas tu entrevista aquí? ` +
    `${CALENDLY_INTERVIEW_URL} Si tienes alguna duda, respóndeme por aquí.`
  );
}

/**
 * Spanish follow-up message (second touch) for a candidate who was contacted
 * but hasn't booked. Shorter than the first message, re-sends the link, and
 * gives an easy out ("solo avísame") — offering a graceful no tends to surface
 * honest declines instead of silence, which keeps the pipeline clean.
 */
export function buildInterviewFollowUpMessage(
  fullName: string | null | undefined,
): string {
  const name = firstName(fullName);
  const greeting = name ? `Hola ${name},` : "Hola,";
  return (
    `${greeting} ¿seguimos con lo de la entrevista en JOI? Te dejo de nuevo ` +
    `el link por si se te pasó: ${CALENDLY_INTERVIEW_URL} También te enviamos ` +
    `un correo — si no lo ves, revisa tu carpeta de spam. Si ya no te ` +
    `interesa, no hay problema, solo avísame.`
  );
}

/** Build the wa.me deep link that opens WhatsApp with the message pre-filled. */
export function buildWhatsAppUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
