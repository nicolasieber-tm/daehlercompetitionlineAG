// Die vom Admin bearbeitete und gesendete Antwort (Antwortentwurf, siehe
// docs/architektur.md, Abschnitt "Antwortentwurf"). Betreff aus
// draft.subject, Text aus draft.body als Absätze, dazu die Fussnote
// (mail.reply.footer). Kein zusätzlicher Inhalt: der Entwurf ist bereits
// vollständig (Anrede, Positionen, Preis, Termin, Signatur).
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { MailInquiryContext } from "../types";
import { fineprint, paragraphs, renderMail } from "../render";

export function buildReply(ctx: MailInquiryContext): { subject: string; html: string; text: string } {
  const dict = getDictionary(ctx.locale);
  const subject = ctx.draft.subject;

  const blocks = [...paragraphs(ctx.draft.body), fineprint(dict.mail.reply.footer)];

  const { html, text } = renderMail({ blocks });
  return { subject, html, text };
}
