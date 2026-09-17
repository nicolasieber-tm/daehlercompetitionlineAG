// Bestätigungsmail an den Kunden direkt nach dem Absenden der Anfrage.
// Struktur laut docs/architektur.md, Abschnitt "Anfrage anlegen": Kunde
// (Sie-Form, locale), Zusammenfassung (Fahrzeug, Wunsch, Positionen,
// Richtpreis mit Unverbindlichkeitshinweis, Termin, Kontaktkanal), Link auf
// shareUrl, "nächste Schritte".
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
  stepsList,
} from "../render";

/**
 * Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
 * dieselbe Positionsdarstellung wie im Antwortentwurf ("Stufe 1 (590 PS /
 * 720 Nm, M6 & A8-Getriebe)" statt des vollen, mehrdeutigen Excel-Namens).
 * itemList()/render.ts selbst bleiben unverändert.
 *
 * Korrektur 15.09.2026 (Prüfung Modul Produkte, Befund 2): isStage über
 * lib/catalog/product-display.ts isStageItem() (variant_group ===
 * "leistung", Fallback ps_to != null für ältere, gespeicherte Anfragen ohne
 * variant_group) statt über `ps_to != null` allein - 13 aktive Stufen ohne
 * ps_to (noch unbepreiste Platzhalter) wurden sonst fälschlich mit dem
 * rohen "(Basis ...) PS / Nm"-Excel-Namen statt "Stufe N"/
 * "Leistungssteigerung" angezeigt, anders als Kachel und Antwortentwurf
 * (die schon variant_group nutzten, siehe lib/draft/template.ts). Siehe
 * auch lib/inquiry/summary.ts displayItem() (gleiche Herleitung).
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

export function buildConfirmation(ctx: MailInquiryContext): { subject: string; html: string; text: string } {
  const dict = getDictionary(ctx.locale);
  const model = vehicleLabel({ family: ctx.family, model: ctx.model, vehicleText: ctx.inquiry.vehicle_text, line: ctx.inquiry.line });
  const first = ctx.inquiry.first_name ?? "";
  const subject = tf(dict.mail.confirmation.subject, { model, number: ctx.inquiry.number });

  const wish = ctx.inquiry.categories
    .map((c) => categoryLabel(c, ctx.locale))
    .concat(ctx.inquiry.consulting ? [dict.steps.done.package.adviceLine] : [])
    .join(", ");
  const timing = optionLabel(dict.steps.timing.options, ctx.inquiry.timing);
  const channel = optionLabel(dict.steps.contact.channels, ctx.inquiry.channel);
  const hasOnRequest = ctx.items.some((item) => item.price_status !== "priced");
  // Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): dieselbe Vorher/Nachher-
  // Übersicht wie im Abschluss-Screen des Flows (components/ui/BeforeAfter.tsx),
  // farblich hervorgehoben, hier über die gemeinsame Zeilen-Herleitung
  // lib/catalog/before-after.ts (ersetzt die bisherige einzelne
  // "Leistung: ..."-Zeile in der definitionList oben, keine Doppelung).
  // Kurzablauf ohne Kategorien und ohne Komplettpaket: keine Tabelle (leere
  // rows sonst nur die immer vorhandene Charakter-Zeile ohne Bezug).
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
    paragraph(tf(dict.mail.confirmation.intro, { first })),
    paragraph(tf(dict.mail.confirmation.body, { model })),
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
    stepsList([
      { label: dict.steps.done.next.now.title, value: dict.mail.confirmation.nowText },
      { label: dict.steps.done.next.day1.title, value: dict.steps.done.next.day1.text },
      { label: dict.steps.done.next.then.title, value: dict.steps.done.next.then.text },
    ]),
    paragraph(dict.mail.confirmation.closing),
  ];

  const { html, text } = renderMail({ title: subject, blocks });
  return { subject, html, text };
}
