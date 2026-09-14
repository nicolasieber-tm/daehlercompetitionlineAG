// Bestätigungsmail an den Kunden direkt nach dem Absenden der Anfrage.
// Struktur laut docs/architektur.md, Abschnitt "Anfrage anlegen": Kunde
// (Sie-Form, locale), Zusammenfassung (Fahrzeug, Wunsch, Positionen,
// Richtpreis mit Unverbindlichkeitshinweis, Termin, Kontaktkanal), Link auf
// shareUrl, "nächste Schritte".
import { getDictionary, tf } from "@/lib/i18n/dictionaries";
import type { MailInquiryContext } from "../types";
import {
  buttonLink,
  categoryLabel,
  definitionList,
  estimateBox,
  itemList,
  optionLabel,
  paragraph,
  renderMail,
  vehicleLabel,
} from "../render";

export function buildConfirmation(ctx: MailInquiryContext): { subject: string; html: string; text: string } {
  const dict = getDictionary(ctx.locale);
  const model = vehicleLabel({ family: ctx.family, model: ctx.model, vehicleText: ctx.inquiry.vehicle_text });
  const first = ctx.inquiry.first_name ?? "";
  const subject = tf(dict.mail.confirmation.subject, { model, number: ctx.inquiry.number });

  const wish = ctx.inquiry.categories
    .map((c) => categoryLabel(c, ctx.locale))
    .concat(ctx.inquiry.consulting ? [dict.steps.done.package.adviceLine] : [])
    .join(", ");
  const timing = optionLabel(dict.steps.timing.options, ctx.inquiry.timing);
  const channel = optionLabel(dict.steps.contact.channels, ctx.inquiry.channel);
  const hasOnRequest = ctx.items.some((item) => item.price_status !== "priced");

  const blocks = [
    paragraph(tf(dict.mail.confirmation.intro, { first })),
    paragraph(tf(dict.mail.confirmation.body, { model })),
    definitionList([
      { label: dict.mail.confirmation.vehicleLabel, value: model },
      { label: dict.mail.confirmation.wishLabel, value: wish },
      { label: dict.mail.confirmation.timingLabel, value: timing ?? "" },
      { label: dict.mail.confirmation.channelLabel, value: channel ?? "" },
    ]),
    itemList(ctx.items, ctx.locale),
    estimateBox({ estimatedTotal: ctx.estimatedTotal, hasOnRequest, locale: ctx.locale }),
    buttonLink(dict.mail.shared.viewPackageButton, ctx.shareUrl),
    definitionList([
      { label: dict.steps.done.next.now.title, value: dict.steps.done.next.now.text },
      { label: dict.steps.done.next.day1.title, value: dict.steps.done.next.day1.text },
      { label: dict.steps.done.next.then.title, value: dict.steps.done.next.then.text },
    ]),
    paragraph(dict.mail.confirmation.closing),
  ];

  const { html, text } = renderMail({ title: subject, blocks });
  return { subject, html, text };
}
