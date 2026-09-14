// Interne Anfrage-Mail an settings.mail_inbox (info@daehler.com), immer
// Deutsch (siehe CLAUDE.md, Abschnitt "Mailversand": "Anfragen selbst gehen
// an info@daehler.com"). Struktur wie die Ticket-Ansicht in
// docs/vorschau.html, Funktion renderIntern(): ANFRAGE, EINGANG, KUNDE,
// KONTAKT VIA (inkl. Bestands-/Neukunde), FAHRZEUG, GEWÜNSCHT, ZIEL,
// CHARAKTER, TERMIN, GESCHÄTZTES PAKET, ZU PRÜFEN, KUNDE SCHREIBT, dann der
// Antwortentwurf als Blockzitat, Button "Im Admin öffnen".
//
// Bewusst immer mit dem deutschen Dictionary (de), unabhängig von
// ctx.locale: diese Mail ist für dÄHLer, nicht für den Kunden (dessen
// locale nur die Kunden-Vorlagen steuert).
import { de } from "@/lib/i18n/de";
import { tf } from "@/lib/i18n/dictionaries";
import { admin } from "@/lib/i18n/admin";
import { formatDate, inquiryNumberLabel } from "@/lib/i18n/format";
import type { MailInquiryContext } from "../types";
import {
  buttonLink,
  categoryLabel,
  checklist,
  definitionList,
  estimateBox,
  itemList,
  optionLabel,
  paragraph,
  quote,
  renderMail,
  vehicleLabel,
} from "../render";

const LOCALE = "de" as const;
const t = admin.mail.inbox.ticket;

/** steps.character.options trägt "title" statt "label" (siehe lib/i18n/de.ts), deshalb kein optionLabel(). */
function characterLabel(id: string | null): string | null {
  return de.steps.character.options.find((o) => o.id === id)?.title ?? null;
}

function goalLine(ctx: MailInquiryContext): string {
  const parts: string[] = [];
  const motorItem = ctx.items.find((i) => i.category === "motor");
  if (motorItem?.description) parts.push(`ca. ${motorItem.description}`);

  const answers = (ctx.inquiry.follow_up_answers ?? {}) as Record<string, string>;
  const followUp = de.steps.category.followUp as Record<string, { options: readonly { id: string; label: string }[] }>;
  for (const category of ctx.inquiry.categories) {
    const answerId = answers[category];
    const label = optionLabel(followUp[category]?.options, answerId);
    if (!label) continue;
    parts.push(category === "motor" ? label : `${categoryLabel(category, LOCALE)}: ${label}`);
  }
  return parts.join(", ");
}

export function buildInbox(ctx: MailInquiryContext): { subject: string; html: string; text: string } {
  const { inquiry } = ctx;
  const vehicle = vehicleLabel({ family: ctx.family, model: ctx.model, vehicleText: inquiry.vehicle_text });
  const name = [inquiry.first_name, inquiry.last_name].filter(Boolean).join(" ");
  const subject = tf(de.mail.inbox.subject, { number: inquiry.number, vehicle, name });

  const received =
    `${formatDate(new Date(inquiry.created_at), LOCALE)} · ` +
    (inquiry.source === "quick" ? t.viaQuick : t.viaWeb);
  const customer = [name, inquiry.city].filter(Boolean).join(", ") +
    [inquiry.phone, inquiry.email].filter(Boolean).map((v) => ` · ${v}`).join("");
  const channel = optionLabel(de.steps.contact.channels, inquiry.channel);
  const contactVia = [channel, inquiry.been_here ? t.existingCustomer : t.newCustomer]
    .filter(Boolean)
    .join(" · ");
  const seriesText = ctx.model?.series_ps
    ? ` · Serie ${ctx.model.series_ps} PS / ${ctx.model.series_nm ?? "?"} Nm`
    : "";
  const vehicleLine = `${vehicle}${inquiry.year ? ` · Baujahr ${inquiry.year}` : ""}${seriesText}`;
  const wish =
    inquiry.categories
      .map((c) => categoryLabel(c, LOCALE))
      .concat(inquiry.consulting ? [de.steps.done.package.adviceLine] : [])
      .join(" + ") || t.none;
  const character = characterLabel(inquiry.character) ?? t.none;
  const timing = optionLabel(de.steps.timing.options, inquiry.timing) ?? t.none;
  const hasOnRequest = ctx.items.some((item) => item.price_status !== "priced");

  const blocks = [
    paragraph(de.mail.inbox.intro),
    definitionList([
      { label: t.request, value: inquiryNumberLabel(inquiry.number, LOCALE) },
      { label: t.received, value: received },
      { label: t.customer, value: customer },
      { label: t.contactVia, value: contactVia },
      { label: t.vehicle, value: vehicleLine },
      { label: t.wish, value: wish },
      { label: t.goal, value: goalLine(ctx) },
      { label: t.character, value: character },
      { label: t.timing, value: timing },
    ]),
    paragraph(t.package),
    itemList(ctx.items, LOCALE),
    estimateBox({ estimatedTotal: ctx.estimatedTotal, hasOnRequest, locale: LOCALE }),
    ...(ctx.checks.length > 0
      ? [paragraph(t.checks), checklist(ctx.checks.map((c) => c.text))]
      : []),
    ...(inquiry.message ? [paragraph(t.customerWrites), quote(inquiry.message)] : []),
    paragraph(admin.mail.inbox.draftHeading),
    quote(ctx.draft.body),
    buttonLink(admin.mail.inbox.button, ctx.adminUrl),
  ];

  const { html, text } = renderMail({ title: subject, blocks });
  return { subject, html, text };
}
