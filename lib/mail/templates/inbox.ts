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
import { goalText } from "@/lib/inquiry/summary";
import { displayItemFields, isStageItem } from "@/lib/catalog/product-display";
import { vehicleInternalLine } from "@/lib/catalog/vehicle-label";
import { buildBeforeAfterRows } from "@/lib/catalog/before-after";
import type { MailInquiryContext, MailInquiryItem } from "../types";
import {
  beforeAfterTable,
  buttonLink,
  categoryLabel,
  checklist,
  definitionList,
  estimateBox,
  itemList,
  monoBlock,
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

/**
 * Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
 * dieselbe Positionsdarstellung wie im Antwortentwurf ("Stufe 1 (590 PS /
 * 720 Nm, M6 & A8-Getriebe)"), PLUS den Original-Excel-Namen als zweite
 * Beschreibungszeile ("dÄHLer kennt seine Bezeichnungen") - nur bei
 * Positionen, wo sich der angezeigte Name vom Excel-Namen unterscheidet
 * (Motor-Leistungsstufen), sonst wäre die Zeile für die meisten Positionen
 * nur eine redundante Wiederholung.
 *
 * Korrektur 15.09.2026 (Prüfung Modul Produkte, Befund 2): isStage über
 * lib/catalog/product-display.ts isStageItem() (variant_group statt
 * `ps_to != null`, siehe dortiger Kommentar und confirmation.ts
 * customerItems()) - wie lib/inquiry/summary.ts displayItem().
 */
function inboxItems(items: MailInquiryItem[]): MailInquiryItem[] {
  return items.map((item) => {
    const display = displayItemFields(
      { name: item.name, description: item.description, isStage: isStageItem(item), psTo: item.ps_to ?? null, nmTo: item.nm_to ?? null },
      "de",
    );
    const description = display.originalName ? `Excel: ${display.originalName}` : display.description;
    return { ...item, name: display.name, description };
  });
}

/** "Handschalter"/"Automat"/"unbekannt", oder null wenn die Getriebefrage nie gestellt wurde (dann keine eigene Zeile). */
function gearboxValue(gearbox: string | null): string | null {
  if (!gearbox) return null;
  return (admin.gearbox as Record<string, string>)[gearbox] ?? null;
}

/**
 * "ZIEL"-Zeile: Leistungsangabe des gewählten Motor-Leistungsprodukts plus
 * die beantworteten Folgefragen je gewählter Kategorie.
 *
 * Prüfung Phase B, Punkt 2 (major): die Leistungsangabe kam bisher aus
 * `motorItem.description` (products.description, die Fortsetzungszeilen-
 * Beschreibung aus der Excel, z.B. Reifendimensionen bei Radsätzen - beim
 * Motor-Leistungsprodukt selbst meist leer oder fachfremd) statt aus
 * ps_to/nm_to ("ca. 620 PS / 740 Nm", siehe docs/architektur.md Beispiel).
 * Der Rest der Zeile (Folgefragen je Kategorie) dupliziert bislang die
 * gleichnamige Logik aus lib/inquiry/summary.ts goalText() eins zu eins -
 * dieser Teil wird jetzt von dort importiert statt hier ein zweites Mal zu
 * pflegen (Duplikat entfernen).
 *
 * Volle Delegation an goalText() (inkl. seines eigenen, noch auf
 * description basierenden Motor-Teils) würde die ps_to/nm_to-Korrektur
 * hier wieder zunichtemachen - lib/inquiry/summary.ts gehört nicht zu den
 * für diese Aufgabe freigegebenen Dateien (siehe Bericht), kann also nicht
 * ebenfalls korrigiert werden. Deshalb: das Motor-Item wird für den
 * goalText()-Aufruf mit description=null übergeben (unterdrückt dessen
 * eigenen, hier bewusst nicht mehr gewünschten "ca. {description}"-Teil),
 * die korrekte Leistungsangabe wird davor gesetzt.
 *
 * ps_to/nm_to sind auf MailInquiryItem (lib/mail/types.ts) optional: solange
 * lib/inquiry/create.ts/context.ts (ausserhalb dieser Aufgabe) sie nicht in
 * inquiries.selections mitspeichern, bleibt die Leistungsangabe schlicht
 * weg statt die alte, falsche description-Angabe zu zeigen (siehe Bericht).
 */
function goalLine(ctx: MailInquiryContext): string {
  const motorItem = ctx.items.find((i) => i.category === "motor");
  const performance =
    motorItem?.ps_to != null
      ? motorItem.nm_to != null
        ? `ca. ${motorItem.ps_to} PS / ${motorItem.nm_to} Nm`
        : `ca. ${motorItem.ps_to} PS`
      : null;

  const itemsForAnswers = ctx.items.map((i) => (i.category === "motor" ? { ...i, description: null } : i));
  const answers = goalText({ ...ctx, items: itemsForAnswers });

  return [performance, answers].filter(Boolean).join(", ");
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
  // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
  // "Getriebe: Handschalter" analog "Serie ... PS / ... Nm" hart in die
  // Fahrzeug-Zeile eingesetzt (kein eigener admin.mail.inbox.ticket-Eintrag
  // nötig, der trägt nur GROSSGESCHRIEBENE Zeilen-Labels). Ergänzung
  // 15.09.2026 (docs/architektur.md, Abschnitt "Fahrzeugbezeichnung", Regel
  // 5): "Baureihe: ... · Motorisierung: ..." roh angehängt, damit dÄHLer die
  // Excel-Preisliste sofort zuordnen kann.
  const gearboxText = gearboxValue(inquiry.gearbox);
  const internalLine = ctx.family ? ` · ${vehicleInternalLine(ctx.family, ctx.model)}` : "";
  const vehicleLine = `${vehicle}${inquiry.year ? ` · Baujahr ${inquiry.year}` : ""}${seriesText}${
    gearboxText ? ` · Getriebe: ${gearboxText}` : ""
  }${internalLine}`;
  const wish =
    inquiry.categories
      .map((c) => categoryLabel(c, LOCALE))
      .concat(inquiry.consulting ? [de.steps.done.package.adviceLine] : [])
      .join(" + ") || t.none;
  const character = characterLabel(inquiry.character) ?? t.none;
  const timing = optionLabel(de.steps.timing.options, inquiry.timing) ?? t.none;
  const hasOnRequest = ctx.items.some((item) => item.price_status !== "priced");
  // Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): dieselbe Vorher/Nachher-
  // Übersicht wie in der Kundenmail (confirmation.ts/summary.ts), hier als
  // kompakter Klartext-Block (monoBlock(), keine farbige HTML-Tabelle),
  // "damit dÄHLer dasselbe sieht" wie der Kunde. Nur die .text-Fassung von
  // beforeAfterTable() wird verwendet (dieselben Zeilen wie in der
  // Kundenmail), die farbige .html-Fassung bleibt dem Kunden vorbehalten.
  const showBeforeAfter = inquiry.categories.length > 0 || inquiry.consulting;
  const beforeAfterRows = buildBeforeAfterRows({
    categories: inquiry.categories,
    consulting: inquiry.consulting,
    items: ctx.items,
    character: inquiry.character,
    seriesPs: inquiry.series_ps,
    seriesNm: ctx.model?.series_nm ?? null,
    locale: LOCALE,
  });

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
    itemList(inboxItems(ctx.items), LOCALE),
    estimateBox({ estimatedTotal: ctx.estimatedTotal, hasOnRequest, locale: LOCALE }),
    ...(showBeforeAfter
      ? [paragraph(t.beforeAfter), monoBlock(beforeAfterTable(beforeAfterRows, LOCALE).text)]
      : []),
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
