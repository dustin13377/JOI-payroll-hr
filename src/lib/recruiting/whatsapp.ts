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
 * Normalize a Mexican phone number to digits-only with the 52 country code,
 * which is what wa.me expects (no +, spaces, or dashes).
 *
 * Handles the common shapes we see in applications:
 *   - "33 1234 5678"        (10-digit local)        -> 523312345678
 *   - "+52 33 1234 5678"    (with country code)     -> 523312345678
 *   - "+52 1 33 1234 5678"  (old mobile "1" prefix) -> 523312345678
 *
 * Returns null if we can't confidently produce a valid number, so the caller
 * can disable the button rather than open WhatsApp to a broken contact.
 */
export function normalizeMxPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Old Mexican mobile format: 52 + 1 + 10 digits -> drop the legacy 1.
  if (digits.length === 13 && digits.startsWith("521")) {
    digits = "52" + digits.slice(3);
  }

  // Already has country code: 52 + 10 digits.
  if (digits.length === 12 && digits.startsWith("52")) {
    return digits;
  }

  // Bare 10-digit local number -> prepend country code.
  if (digits.length === 10) {
    return "52" + digits;
  }

  // Anything else we can't trust (too short, foreign, malformed).
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
