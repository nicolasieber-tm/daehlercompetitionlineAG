// Öffentliche Schnittstelle von lib/mail: Re-Exports der Bausteine plus
// sendInquiryMail() als Komfortfunktion, die eine Vorlage baut und direkt
// über sendMail() verschickt. Siehe docs/architektur.md, Abschnitt "Mail".
import { randomUUID } from "node:crypto";
import type { EmailType } from "@/lib/supabase/rows";
import { sendMail } from "./resend";
import type { SendMailResult } from "./resend";
import { getSettings } from "./settings";
import type { MailFollowUpContext, MailInquiryContext } from "./types";
import { buildConfirmation } from "./templates/confirmation";
import { buildSummary } from "./templates/summary";
import { buildInbox } from "./templates/inbox";
import { buildReply } from "./templates/reply";
import { buildFollowUp } from "./templates/follow_up";

export * from "./types";
export * from "./render";
export { sendMail, resetResendClient } from "./resend";
export type { SendMailInput, SendMailResult } from "./resend";
export { getSettings, clearSettingsCache } from "./settings";
export { buildConfirmation, buildSummary, buildInbox, buildReply, buildFollowUp };

/**
 * Baut die passende Vorlage für `type` und verschickt sie über sendMail().
 * Der Empfänger ergibt sich aus dem Typ, kein eigener to-Parameter nötig:
 * confirmation, summary, reply und follow_up gehen an die E-Mail-Adresse der
 * Anfrage, inbox an settings.mail_inbox (siehe lib/mail/settings.ts).
 *
 * follow_up braucht einen eigenen Kontext (MailFollowUpContext, siehe
 * lib/mail/types.ts): Betreff/Text kommen dort aus der Regel, nicht aus
 * lib/draft.
 */
export async function sendInquiryMail(
  type: "confirmation" | "summary" | "reply" | "inbox",
  ctx: MailInquiryContext,
): Promise<SendMailResult>;
export async function sendInquiryMail(type: "follow_up", ctx: MailFollowUpContext): Promise<SendMailResult>;
export async function sendInquiryMail(
  type: EmailType,
  ctx: MailInquiryContext | MailFollowUpContext,
): Promise<SendMailResult> {
  if (type === "follow_up") {
    const fCtx = ctx as MailFollowUpContext;
    if (!fCtx.inquiry.email) {
      return {
        ok: false,
        error: "sendInquiryMail: Anfrage hat keine E-Mail-Adresse.",
        outboundEmailId: randomUUID(),
      };
    }
    const { subject, html, text } = buildFollowUp(fCtx);
    return sendMail({
      to: fCtx.inquiry.email,
      subject,
      html,
      text,
      type,
      inquiryId: fCtx.inquiry.id,
      locale: fCtx.locale,
    });
  }

  const iCtx = ctx as MailInquiryContext;
  let built: { subject: string; html: string; text: string };
  switch (type) {
    case "confirmation":
      built = buildConfirmation(iCtx);
      break;
    case "summary":
      built = buildSummary(iCtx);
      break;
    case "reply":
      built = buildReply(iCtx);
      break;
    case "inbox":
      built = buildInbox(iCtx);
      break;
    default: {
      const unknownType: string = type;
      return {
        ok: false,
        error: `sendInquiryMail: unbekannter Typ "${unknownType}".`,
        outboundEmailId: randomUUID(),
      };
    }
  }

  // getSettings() wirft bei DB-Fehler (lib/mail/settings.ts). sendInquiryMail()
  // darf trotzdem nie nach aussen werfen (die Anfrage ist zu diesem Zeitpunkt
  // bereits gespeichert, siehe Aufrufer in create.ts), deshalb hier
  // abgefangen statt den Fehler durchzureichen (Befund 2).
  let to: string | undefined | null;
  if (type === "inbox") {
    try {
      to = (await getSettings()).mail_inbox;
    } catch (err) {
      console.error("sendInquiryMail: settings für mail_inbox konnten nicht geladen werden.", err);
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: `sendInquiryMail: mail_inbox nicht ermittelbar: ${message}`,
        outboundEmailId: randomUUID(),
      };
    }
  } else {
    to = iCtx.inquiry.email;
  }
  if (!to) {
    return {
      ok: false,
      error: `sendInquiryMail: keine Empfängeradresse für Typ "${type}" ermittelbar.`,
      outboundEmailId: randomUUID(),
    };
  }

  return sendMail({
    to,
    subject: built.subject,
    html: built.html,
    text: built.text,
    type,
    inquiryId: iCtx.inquiry.id,
    locale: iCtx.locale,
  });
}
