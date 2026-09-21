// Klartext-Zusammenfassung einer Anfrage, wie die interne Ticket-Ansicht in
// docs/vorschau.html (renderIntern(), goal()). Für die interne Anfrage-Mail
// und die künftige Admin-Detailansicht (Aufgabenstellung: "buildSummaryText
// (ctx): der Klartext-Block wie renderIntern() in der Vorschau (für
// Inbox-Mail und Admin); goalText(ctx) wie goal()").
//
// Hinweis für den Bericht: lib/mail/templates/inbox.ts (nicht Teil dieser
// Aufgabe) hat dieselbe Logik (goalLine(), characterLabel()) bereits selbst
// inline eingebaut, bevor dieses Modul entstand - eine spätere
// Zusammenlegung (inbox.ts auf goalText()/buildSummaryText() umstellen)
// wäre sinnvoll, liegt aber ausserhalb der mir zugewiesenen Dateien.
//
// Immer Deutsch: interne Admin-Texte sind laut CLAUDE.md ausschliesslich
// Deutsch (lib/i18n/admin.ts, kein en nötig), unabhängig von ctx.locale
// (der Sprache, in der der KUNDE die Anfrage gestellt hat) - analog
// lib/mail/templates/inbox.ts ("Bewusst immer mit dem deutschen
// Dictionary").
import { de } from "@/lib/i18n/de";
import { admin } from "@/lib/i18n/admin";
import { chfFrom, formatDate, inquiryNumberLabel } from "@/lib/i18n/format";
import { categoryLabel, itemLineText, optionLabel, vehicleLabel } from "@/lib/mail/render";
import { vehicleInternalLine } from "@/lib/catalog/vehicle-label";
import { displayItemFields, isStageItem } from "@/lib/catalog/product-display";
import type { MailInquiryContext, MailInquiryItem } from "@/lib/mail/types";

const LOCALE = "de" as const;
const t = admin.mail.inbox.ticket;
// Spaltenbreite der Label-Zeilen, wie renderIntern() in docs/vorschau.html
// (dort z.B. "KONTAKT VIA" + 4 Leerzeichen = 15 Zeichen vor dem Wert; alle
// Labels dort sind manuell auf dieselbe Spalte ausgerichtet).
const LABEL_WIDTH = 15;

function line(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)} ${value}`;
}

/** steps.character.options trägt "title" statt "label" (siehe lib/i18n/de.ts), deshalb kein optionLabel(). */
function characterLabel(id: string | null): string | null {
  return de.steps.character.options.find((o) => o.id === id)?.title ?? null;
}

/**
 * Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
 * dieselbe Positionsdarstellung wie im Antwortentwurf/den Mails ("Stufe 1
 * (590 PS / 720 Nm, M6 & A8-Getriebe)" statt des vollen Excel-Namens).
 *
 * Korrektur 15.09.2026 (Prüfung Modul Produkte, Befund 2): isStage über
 * lib/catalog/product-display.ts isStageItem() (MailInquiryItem kennt
 * variant_group inzwischen, siehe lib/mail/types.ts; Fallback auf
 * `ps_to != null` nur noch für ältere, vor dieser Korrektur gespeicherte
 * Anfragen ohne dieses Feld) statt der bisherigen reinen
 * `ps_to != null`-Herleitung, dieselbe Herleitung wie
 * lib/mail/templates/inbox.ts inboxItems().
 */
function displayItem(item: MailInquiryItem): MailInquiryItem {
  const display = displayItemFields(
    { name: item.name, description: item.description, isStage: isStageItem(item), psTo: item.ps_to ?? null, nmTo: item.nm_to ?? null },
    LOCALE,
  );
  return { ...item, name: display.name, description: display.description };
}

/** Rückmeldung erster Klicktest, CLAUDE.md Abschnitt "AUFGABE", Punkt 3: "Handschalter"/"Automat"/"unbekannt", oder null wenn nie gefragt (dann keine eigene Zeile). */
function gearboxValue(gearbox: string | null): string | null {
  if (!gearbox) return null;
  return (admin.gearbox as Record<string, string>)[gearbox] ?? null;
}

/** Entscheid 21.09.2026: «Karosserie: Touring» / «Antrieb: xDrive», nur wenn bekannt. */
function bodyStyleValue(bodyStyle: string | null): string | null {
  if (!bodyStyle) return null;
  return (admin.bodyStyle as Record<string, string>)[bodyStyle] ?? bodyStyle;
}

function driveValue(drive: string | null): string | null {
  if (!drive) return null;
  return (admin.drive as Record<string, string>)[drive] ?? drive;
}

/**
 * "ZIEL"-Zeile wie goal() in docs/vorschau.html: die Beschreibung des
 * gewählten Motor-Produkts plus die beantworteten Folgefragen je gewählter
 * Kategorie.
 */
export function goalText(ctx: MailInquiryContext): string {
  const parts: string[] = [];
  const motorItem = ctx.items.find((i) => i.category === "motor");
  if (motorItem?.description) parts.push(`ca. ${motorItem.description}`);

  const answers = (ctx.inquiry.follow_up_answers ?? {}) as Record<string, string>;
  const followUp = de.steps.category.followUp as Record<
    string,
    { options: readonly { id: string; label: string }[] }
  >;
  for (const category of ctx.inquiry.categories) {
    const answerId = answers[category];
    const label = optionLabel(followUp[category]?.options, answerId);
    if (!label) continue;
    parts.push(category === "motor" ? label : `${categoryLabel(category, LOCALE)}: ${label}`);
  }
  return parts.join(", ");
}

/**
 * Der vollständige Klartext-Block wie renderIntern() in docs/vorschau.html:
 * ANFRAGE, EINGANG, KUNDE, KONTAKT VIA, FAHRZEUG, GEWÜNSCHT, ZIEL,
 * CHARAKTER, TERMIN, GESCHÄTZTES PAKET (Positionen + Richtpreis), ZU
 * PRÜFEN, KUNDE SCHREIBT.
 *
 * Positionszeilen nutzen itemLineText() (dieselbe "• Kategorie: Name
 * (Beschreibung), ab CHF x"-Form wie Antwortentwurf und Mails) statt der
 * handjustierten Tabellenspalten aus der Vorschau: das hält den Ticket-Text
 * konsistent mit jeder anderen Stelle, die Positionen zeigt, statt ein
 * drittes, eigenes Format einzuführen.
 */
export function buildSummaryText(ctx: MailInquiryContext): string {
  const { inquiry } = ctx;
  const vehicle = vehicleLabel({ family: ctx.family, model: ctx.model, vehicleText: inquiry.vehicle_text, line: inquiry.line });
  const name = [inquiry.first_name, inquiry.last_name].filter(Boolean).join(" ");

  const received = `${formatDate(new Date(inquiry.created_at), LOCALE)} · ${
    inquiry.source === "quick" ? t.viaQuick : t.viaWeb
  }`;
  const customer =
    [name, inquiry.city].filter(Boolean).join(", ") +
    [inquiry.phone, inquiry.email].filter(Boolean).map((v) => ` · ${v}`).join("");
  const channel = optionLabel(de.steps.contact.channels, inquiry.channel);
  const contactVia = [channel, inquiry.been_here ? t.existingCustomer : t.newCustomer]
    .filter(Boolean)
    .join(" · ");
  const seriesText = ctx.model?.series_ps
    ? ` · Serie ${ctx.model.series_ps} PS / ${ctx.model.series_nm ?? "?"} Nm`
    : "";
  // "Getriebe: Handschalter" wie "Serie ... PS / ... Nm" oben hart in die
  // Fahrzeug-Zeile eingesetzt statt über admin.mail.inbox.ticket (das trägt
  // nur GROSSGESCHRIEBENE Zeilen-Labels, kein Sub-Wert-Präfix). Ergänzung
  // 15.09.2026 (docs/architektur.md, Abschnitt "Fahrzeugbezeichnung", Regel
  // 5): "Baureihe: ... · Motorisierung: ..." roh (ohne die Aufbereitung von
  // vehicleLabel() oben) an die Zeile angehängt, damit dÄHLer die
  // Excel-Preisliste sofort zuordnen kann.
  const gearboxText = gearboxValue(inquiry.gearbox);
  const bodyStyleText = bodyStyleValue(inquiry.body_style);
  const driveText = driveValue(inquiry.drive);
  const internalLine = ctx.family ? ` · ${vehicleInternalLine(ctx.family, ctx.model, inquiry.line)}` : "";
  const vehicleLine = `${vehicle}${inquiry.year ? ` · Baujahr ${inquiry.year}` : ""}${seriesText}${
    bodyStyleText ? ` · Karosserie: ${bodyStyleText}` : ""
  }${driveText ? ` · Antrieb: ${driveText}` : ""}${gearboxText ? ` · Getriebe: ${gearboxText}` : ""}${internalLine}`;
  const wish =
    inquiry.categories
      .map((c) => categoryLabel(c, LOCALE))
      .concat(inquiry.consulting ? [de.steps.done.package.adviceLine] : [])
      .join(" + ") || t.none;
  const character = characterLabel(inquiry.character) ?? t.none;
  const timing = optionLabel(de.steps.timing.options, inquiry.timing) ?? t.none;

  const packageLines =
    ctx.items.length > 0
      ? ctx.items.map((item) => `  ${itemLineText(displayItem(item), LOCALE).replace(/^•\s*/, "")}`)
      : [`  ${de.draft.itemsFallback}`];
  const totalValue =
    ctx.estimatedTotal != null ? chfFrom(ctx.estimatedTotal, LOCALE) : de.steps.done.package.onRequest;

  const parts: string[] = [
    line(t.request, inquiryNumberLabel(inquiry.number, LOCALE)),
    line(t.received, received),
    line(t.customer, customer),
    line(t.contactVia, contactVia),
    "",
    line(t.vehicle, vehicleLine),
    line(t.wish, wish),
    line(t.goal, goalText(ctx) || t.none),
    line(t.character, character),
    line(t.timing, timing),
    "",
    t.package,
    ...packageLines,
    `  ${t.estimate}: ${totalValue}`,
  ];

  if (ctx.checks.length > 0) {
    parts.push("", t.checks, ...ctx.checks.map((c) => `  ▸ ${c.text}`));
  }
  if (inquiry.message) {
    parts.push("", t.customerWrites, `  «${inquiry.message}»`);
  }

  return parts.join("\n");
}
