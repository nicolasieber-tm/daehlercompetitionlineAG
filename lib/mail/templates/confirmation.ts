// Bestätigungsmail an den Kunden direkt nach dem Absenden der Anfrage.
// Struktur laut docs/architektur.md, Abschnitt "Anfrage anlegen": Kunde
// (Sie-Form, locale), Zusammenfassung (Fahrzeug, Wunsch, Termin,
// Kontaktkanal, Leistung vorher/nachher, Positionen, Richtpreis bzw.
// Paket-Hinweis), Schluss. Rückmeldung dÄHLer 26.11.2026 («zu viel des
// Guten»): ohne Link «Paket ansehen» und ohne «nächste Schritte», Richtpreis
// als normaler Text, Vorher/Nachher nur mit der Leistungszeile (Schalter im
// Admin für die vollständige Tabelle).
import { getDictionary, tf } from "@/lib/i18n/dictionaries";
import { displayItemFields, isStageItem } from "@/lib/catalog/product-display";
import { buildBeforeAfterRows } from "@/lib/catalog/before-after";
import { categoriesWithoutItems } from "@/lib/draft/template";
import { isPackage } from "@/lib/catalog/package";
import { CONFIRMATION_BEFORE_AFTER_FULL_KEY, fillMailText, resolveMailTexts } from "../texts";
import { capitalizeFirst, emphasisText } from "../emphasis";
import { anredeText, modellLabel } from "../anrede";
import type { Character } from "@/lib/db/rows";
import type { FlowCategory } from "@/lib/db/rows";
import type { MailInquiryContext, MailInquiryItem } from "../types";
import {
  beforeAfterTable,
  categoryLabel,
  definitionList,
  estimateBox,
  itemList,
  optionLabel,
  paragraph,
  renderMail,
  sectionHeading,
  vehicleLabel,
  paragraphs,
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
function customerItems(
  items: MailInquiryItem[],
  locale: MailInquiryContext["locale"],
  translations: MailInquiryContext["translations"],
): MailInquiryItem[] {
  return items.map((item) => {
    const display = displayItemFields(
      { name: item.name, description: item.description, isStage: isStageItem(item), psTo: item.ps_to ?? null, nmTo: item.nm_to ?? null },
      locale,
      translations,
    );
    return { ...item, name: display.name, description: display.description };
  });
}

/**
 * Die Mailtexte aus dem Admin, gefüllt (Anrede/Einleitung, Charaktersatz mit
 * Überleitung, Schluss). Eigene Funktion, damit die Live-Vorschau im Admin
 * die tatsächlich verwendeten Textabsätze erkennen kann.
 */
export function confirmationTextParts(ctx: MailInquiryContext): {
  intro: string;
  lead: string;
  closing: string;
  packageOffer: string;
} {
  const model = vehicleLabel({ family: ctx.family, model: ctx.model, vehicleText: ctx.inquiry.vehicle_text, line: ctx.inquiry.line });
  const texts = resolveMailTexts(ctx.locale, ctx.texts);
  const vars = {
    anrede: anredeText(ctx.inquiry.salutation, ctx.inquiry.first_name, ctx.inquiry.last_name, ctx.locale),
    vorname: ctx.inquiry.first_name ?? "",
    name: ctx.inquiry.last_name ?? "",
    fahrzeug: model,
    modell: modellLabel(model),
    nummer: ctx.inquiry.number,
    schwerpunkt: emphasisText(
      ctx.inquiry.categories as FlowCategory[],
      ctx.inquiry.follow_up_answers as Record<string, string | null> | null,
      ctx.locale,
      texts,
    ),
  };
  // Rückmeldung dÄHLer 19.10.2026: Charaktersatz, gefolgt von der
  // Überleitung zur Übersicht. Seit 06.11.2026 nur hier, der Antwortentwurf
  // knüpft an diese Mail an und wiederholt ihn nicht.
  const character = ctx.inquiry.character as Character | null;
  const characterText = capitalizeFirst(fillMailText(texts[`text_draft_character_${character ?? "none"}`], vars));
  return {
    intro: fillMailText(texts.text_confirmation_intro, vars),
    lead: [characterText, fillMailText(texts.text_confirmation_lead, vars)].filter(Boolean).join(" "),
    closing: fillMailText(texts.text_confirmation_closing, vars),
    packageOffer: fillMailText(texts.text_package_offer, vars),
  };
}

export function buildConfirmation(ctx: MailInquiryContext): { subject: string; html: string; text: string } {
  const dict = getDictionary(ctx.locale);
  const model = vehicleLabel({ family: ctx.family, model: ctx.model, vehicleText: ctx.inquiry.vehicle_text, line: ctx.inquiry.line });
  const textParts = confirmationTextParts(ctx);
  // Rückmeldung dÄHLer 14.10.2026 (Anfrage 2026-0016): gewählte Bereiche
  // ohne angetipptes Produkt erscheinen ausdrücklich, statt in der
  // Positionsliste einfach zu fehlen.
  const withoutProducts =
    ctx.family?.has_pricelist === false
      ? []
      : categoriesWithoutItems(ctx.inquiry.categories as FlowCategory[], ctx.items as { category: FlowCategory }[]);
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
  const fullBeforeAfter = ctx.texts?.[CONFIRMATION_BEFORE_AFTER_FULL_KEY] === "1";
  const allBeforeAfterRows = buildBeforeAfterRows({
    categories: ctx.inquiry.categories,
    consulting: ctx.inquiry.consulting,
    items: ctx.items,
    character: ctx.inquiry.character,
    seriesPs: ctx.inquiry.series_ps,
    locale: ctx.locale,
    translations: ctx.translations,
  });
  const beforeAfterRows = fullBeforeAfter ? allBeforeAfterRows : allBeforeAfterRows.filter((row) => row.id === "leistung");
  const showBeforeAfter = (ctx.inquiry.categories.length > 0 || ctx.inquiry.consulting) && beforeAfterRows.length > 0;
  const pricedItems = ctx.items.filter((item) => item.price_status === "priced" && item.price_total != null);
  const packageText = isPackage(pricedItems.map(() => true)) ? textParts.packageOffer : null;

  const blocks = [
    // Einleitung und Schluss pflegt der Kunde im Admin (lib/mail/texts.ts).
    ...paragraphs(textParts.intro),
    paragraph(textParts.lead),
    definitionList([
      { label: dict.mail.confirmation.vehicleLabel, value: model },
      { label: dict.mail.confirmation.wishLabel, value: wish },
      { label: dict.mail.confirmation.timingLabel, value: timing ?? "" },
      { label: dict.mail.confirmation.channelLabel, value: channel ?? "" },
    ]),
    ...(showBeforeAfter
      ? [sectionHeading(dict.mail.shared.beforeAfterTitle), beforeAfterTable(beforeAfterRows, ctx.locale)]
      : []),
    ...(ctx.items.length > 0 || withoutProducts.length === 0
      ? [itemList(customerItems(ctx.items, ctx.locale, ctx.translations), ctx.locale)]
      : []),
    ...(withoutProducts.length > 0
      ? [
          paragraph(
            tf(dict.mail.confirmation.withoutProducts, {
              categories: withoutProducts.map((c) => categoryLabel(c, ctx.locale)).join(", "),
            }),
          ),
        ]
      : []),
    estimateBox({
      estimatedTotal: ctx.estimatedTotal,
      estimatedFrom: pricedItems.some((item) => item.price_from === true),
      hasOnRequest,
      locale: ctx.locale,
      packageText,
    }),
    ...paragraphs(textParts.closing),
  ];

  const { html, text } = renderMail({ title: subject, blocks });
  return { subject, html, text };
}
