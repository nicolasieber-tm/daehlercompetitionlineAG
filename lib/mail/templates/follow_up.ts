// Follow-up-Mail (Posten 6, siehe CLAUDE.md und docs/architektur.md,
// Abschnitt "Follow-ups"). Betreff und Text kommen aus der konfigurierten
// Regel (follow_up_rules), nicht aus lib/draft: {{vorname}}, {{name}},
// {{fahrzeug}}, {{nummer}} werden ersetzt, danach die Signatur aus settings
// angehängt (draft.signature-Muster, siehe lib/i18n/de.ts).
import { getDictionary, tf } from "@/lib/i18n/dictionaries";
import type { MailFollowUpContext } from "../types";
import { paragraphs, renderMail } from "../render";

function fillPlaceholders(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

export function buildFollowUp(ctx: MailFollowUpContext): { subject: string; html: string; text: string } {
  const dict = getDictionary(ctx.locale);
  const vars: Record<string, string> = {
    vorname: ctx.inquiry.first_name ?? "",
    name: ctx.inquiry.last_name ?? "",
    fahrzeug: ctx.vehicleLabel,
    nummer: ctx.inquiry.number,
  };

  const subject = fillPlaceholders(ctx.rule.subject, vars);
  const body = fillPlaceholders(ctx.rule.body, vars);
  const signature = tf(dict.draft.signature, {
    name: ctx.settings.signatureName,
    company: ctx.settings.companyAddress,
    phone: ctx.settings.signaturePhone,
  });

  const blocks = [...paragraphs(body), ...paragraphs(signature)];

  const { html, text } = renderMail({ blocks });
  return { subject, html, text };
}
