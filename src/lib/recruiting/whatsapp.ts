// WhatsApp interview-invite helpers (Path A: one-tap manual send via wa.me).
//
// We do NOT send through any API here. Clicking the button builds a wa.me
// deep link and opens it; the recruiter taps send inside WhatsApp. This needs
// no Meta Business API, no approved templates, and costs nothing. The trade-off
// is that a human taps send and the message goes from whatever WhatsApp account
// is on that device.

export const CALENDLY_INTERVIEW_URL =
  "https://calendly.com/humanresources-justoutsource/30min";

/** Template key recorded on the recruiting_messages row for this message type. */
export const INTERVIEW_INVITE_TEMPLATE_KEY = "interview_invite_whatsapp";

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

/** First given name, for the greeting. Falls back to empty string. */
function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/**
 * Spanish interview-invite message with the Calendly link.
 * Greeting adapts gracefully when we don't have a name.
 */
export function buildInterviewInviteMessage(
  fullName: string | null | undefined,
): string {
  const name = firstName(fullName);
  const greeting = name ? `Hola ${name},` : "Hola,";
  return (
    `${greeting} gracias por aplicar a JOI. Nos gustaría agendar una ` +
    `entrevista contigo. Por favor elige un horario aquí: ${CALENDLY_INTERVIEW_URL}`
  );
}

/** Build the wa.me deep link that opens WhatsApp with the message pre-filled. */
export function buildWhatsAppUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}
