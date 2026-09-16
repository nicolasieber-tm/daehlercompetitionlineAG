// "Zusammenfassung an mich senden" (Abschluss-Screen im Flow, siehe
// CLAUDE.md, Kundenflow Schritt 6). Inhaltlich wie die Bestätigungsmail
// (Fahrzeug, Wunsch, Positionen, Richtpreis, Link), aber mit eigenem
// Betreff/Anrede/Schluss (mail.summary.*) und ohne "nächste Schritte" (die
// Anfrage ist zu diesem Zeitpunkt möglicherweise noch nicht abgeschickt,
// siehe docs/vorschau.html: der Button ist bereits im Kundenflow vor dem
// Absenden sichtbar).
import { getDictionary, tf } from "@/lib/i18n/dictionaries";
import { displayItemFields, isStageItem } from "@/lib/catalog/product-display";
import { buildBeforeAfterRows } from "@/lib/catalog/before-after";
import type { MailInquiryContext, MailInquiryItem } from "../types";
import {
  beforeAfterTable,
  buttonLink,
  categoryLabel,
  definitionList,
  estimateBox,
  itemList,
  optionLabel,
  paragraph,
  renderMail,
  sectionHeading,
  vehicleLabel,
} from "../render";

/**
 * Siehe lib/mail/templates/confirmation.ts customerItems() (dieselbe
 * Herleitung, Rückmeldung erster Klicktest; isStage über
 * lib/catalog/product-display.ts isStageItem() seit Korrektur 15.09.2026,
 * Prüfung Modul Produkte, Befund 2).
 */
function customerItems(items: MailInquiryItem[], locale: MailInquiryContext["locale"]): MailInquiryItem[] {
  return items.map((item) => {
    const display = displayItemFields(
      { name: item.name, description: item.description, isStage: isStageItem(item), psTo: item.ps_to ?? null, nmTo: item.nm_to ?? null },
      locale,
    );
    return { ...item, name: display.name, description: display.description };
  });
}

export function buildSummary(ctx: MailInquiryContext): { subject: string; html: string; text: string } {
  const dict = getDictionary(ctx.locale);
  const model = vehicleLabel({ family: ctx.family, model: ctx.model, vehicleText: ctx.inquiry.vehicle_text });
  const first = ctx.inquiry.first_name ?? "";
  const subject = tf(dict.mail.summary.subject, { number: ctx.inquiry.number });

  const wish = ctx.inquiry.categories
    .map((c) => categoryLabel(c, ctx.locale))
    .concat(ctx.inquiry.consulting ? [dict.steps.done.package.adviceLine] : [])
    .join(", ");
  const timing = optionLabel(dict.steps.timing.options, ctx.inquiry.timing);
  const channel = optionLabel(dict.steps.contact.channels, ctx.inquiry.channel);
  const hasOnRequest = ctx.items.some((item) => item.price_status !== "priced");
  // Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): siehe
  // lib/mail/templates/confirmation.ts (dieselbe Herleitung, ersetzt die
  // bisherige einzelne "Leistung: ..."-Zeile in der definitionList oben).
  const showBeforeAfter = ctx.inquiry.categories.length > 0 || ctx.inquiry.consulting;
  const beforeAfterRows = buildBeforeAfterRows({
    categories: ctx.inquiry.categories,
    consulting: ctx.inquiry.consulting,
    items: ctx.items,
    character: ctx.inquiry.character,
    seriesPs: ctx.inquiry.series_ps,
    seriesNm: ctx.model?.series_nm ?? null,
    locale: ctx.locale,
  });

  const blocks = [
    paragraph(tf(dict.mail.summary.intro, { first })),
    paragraph(tf(dict.mail.summary.body, { model })),
    definitionList([
      { label: dict.mail.confirmation.vehicleLabel, value: model },
      { label: dict.mail.confirmation.wishLabel, value: wish },
      { label: dict.mail.confirmation.timingLabel, value: timing ?? "" },
      { label: dict.mail.confirmation.channelLabel, value: channel ?? "" },
    ]),
    ...(showBeforeAfter
      ? [sectionHeading(dict.mail.shared.beforeAfterTitle), beforeAfterTable(beforeAfterRows, ctx.locale)]
      : []),
    itemList(customerItems(ctx.items, ctx.locale), ctx.locale),
    estimateBox({ estimatedTotal: ctx.estimatedTotal, hasOnRequest, locale: ctx.locale }),
    buttonLink(dict.mail.shared.viewPackageButton, ctx.shareUrl),
    paragraph(dict.mail.summary.closing),
  ];

  const { html, text } = renderMail({ title: subject, blocks });
  return { subject, html, text };
}
