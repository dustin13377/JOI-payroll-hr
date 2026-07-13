// Recruiting email templates. Email is the second-channel nudge — sent by hand
// when a WhatsApp invite went quiet — so the copy stands on its own (the
// candidate may never have seen the WhatsApp message) while still being short
// and giving an easy out.
//
// The client renders subject + body from here and passes them to the
// send-recruiting-email edge function, which sends via Resend and logs the
// exact text to recruiting_messages.

import { CALENDLY_INTERVIEW_URL, firstName } from "@/lib/recruiting/whatsapp";

/** Template key recorded on the recruiting_messages row for the email nudge. */
export const INTERVIEW_FOLLOWUP_EMAIL_TEMPLATE_KEY = "interview_followup_email";

export interface RecruitingEmail {
  subject: string;
  body: string;
}

/**
 * Spanish follow-up email with the booking link. Subject leads with the action
 * so it's obvious in a crowded inbox; body gives a graceful way to decline.
 */
export function buildInterviewFollowUpEmail(
  fullName: string | null | undefined,
): RecruitingEmail {
  const name = firstName(fullName);
  const greeting = name ? `Hola ${name},` : "Hola,";
  const body =
    `${greeting}\n\n` +
    `Te contactamos de JOI por tu solicitud de empleo. Nos gustaría agendar ` +
    `una breve entrevista contigo.\n\n` +
    `Puedes elegir el horario que mejor te acomode aquí:\n` +
    `${CALENDLY_INTERVIEW_URL}\n\n` +
    `Si ya no estás interesado/a, no hay problema — solo respóndenos a este ` +
    `correo para saberlo.\n\n` +
    `Saludos,\n` +
    `Equipo de Recursos Humanos\n` +
    `JOI`;
  return {
    subject: "Tu entrevista con JOI — elige un horario",
    body,
  };
}
