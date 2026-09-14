// Deterministischer Antwortentwurf, siehe CLAUDE.md Abschnitt
// "Antwortentwurf" und docs/architektur.md Abschnitt "Antwortentwurf".
// Referenz: draft() in docs/vorschau.html, umgestellt auf Sie-Form. Reine
// Funktion (kein DB-/Netzwerkzugriff): der Aufrufer (lib/inquiry/create.ts)
// lädt Familie, Modell, Produkte und Einstellungen vorher und übergibt
// bereits aufbereitete, einfache Werte, siehe DraftContext.
import { getDictionary, tf } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/dictionaries";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { chfFrom } from "@/lib/i18n/format";
import { categoryLabel, itemLineText } from "@/lib/mail/render";
import type { Character, FlowCategory, PriceStatus, Timing } from "@/lib/supabase/rows";

export interface DraftItem {
  category: FlowCategory;
  name: string;
  description: string | null;
  priceTotal: number | null;
  priceStatus: PriceStatus;
  /** Nur für Motor-Leistungsprodukte gefüllt (variant_group === 'leistung'). */
  psTo: number | null;
  nmTo: number | null;
  variantGroup: string | null;
}

export interface DraftSettings {
  signatureName: string;
  companyAddress: string;
  signaturePhone: string;
}

export interface DraftContext {
  number: string;
  firstName: string;
  lastName: string;
  /**
   * Fertig aufbereitete Fahrzeugbezeichnung, z.B. "BMW M2 G87" oder (Kurz-
   * ablauf ohne Modell) "Wiesmann"/inquiries.vehicle_text. Absichtlich als
   * fertiger String statt Familie/Modell-Objekten: die BMW/MINI-Dublette-
   * Logik (z.B. "BMW M2 G87 M2" vermeiden) ist bereits in
   * lib/mail/render.ts vehicleLabel() gelöst (siehe dortiger Kommentar
   * "Befund #1 der Mail-Prüfung"), lib/inquiry/create.ts ruft dieselbe
   * Funktion auf und reicht hier nur das Ergebnis durch statt die Logik zu
   * duplizieren. Füllt sowohl draft.subject {vehicle} als auch draft.thanks
   * {model} (siehe lib/mail/templates/confirmation.ts: dieselbe
   * vehicleLabel()-Variable wird dort ebenfalls für beide Platzhalter
   * verwendet).
   */
  vehicleLabel: string;
  /** Freitext-Baujahr oder der lokalisierte "älter"-Sentinel (steps.car.yearOlder). */
  year: string | null;
  character: Character;
  categories: FlowCategory[];
  consulting: boolean;
  timing: Timing;
  /** family.has_pricelist: steuert den Kurzablauf (siehe CLAUDE.md "Modelle ohne Preisliste"). */
  hasPricelist: boolean;
  /** Gewählte Produkte mit bereits serverseitig geladenen Preisen (leer im Kurzablauf). */
  items: DraftItem[];
  /** Summe der price_total der priced-Produkte, oder null (siehe lib/inquiry/create.ts). */
  estimatedTotal: number | null;
  settings: DraftSettings;
}

// "älter" (de) / "older" (en), siehe lib/rules/checks.ts (gleiche
// Begründung: steps.car.yearOlder ist kein sprachneutraler Wert).
const YEAR_OLDER_VALUES = new Set(
  [de.steps.car.yearOlder, en.steps.car.yearOlder].map((v) => v.trim().toLowerCase()),
);

function isOlderYear(year: string | null): boolean {
  return !!year && YEAR_OLDER_VALUES.has(year.trim().toLowerCase());
}

const STAGE_PATTERN = /Stufe\s*\d+/i;

/** Extrahiert "Stufe 1"/"Stufe 2" aus dem (deutschen, siehe CLAUDE.md
 * "Produktnamen ... bleiben Deutsch") Excel-Produktnamen für performanceLine
 * {stage}. Ohne Treffer (sollte bei variant_group 'leistung' nicht
 * vorkommen) bleibt der volle Name als Fallback, nie ein leerer Platzhalter. */
function stageLabel(name: string): string {
  const match = STAGE_PATTERN.exec(name);
  return match ? match[0].replace(/\s+/g, " ") : name;
}

type ClarificationKey = "clarificationFahrwerk" | "clarificationMotorAuspuff" | "clarificationGeneric";

/** Reihenfolge wie draft() in docs/vorschau.html: Fahrwerk zuerst, dann Motor+Auspuff, sonst generisch. */
function clarificationKey(categories: readonly FlowCategory[]): ClarificationKey {
  if (categories.includes("fahrwerk")) return "clarificationFahrwerk";
  if (categories.includes("motor") && categories.includes("auspuff")) return "clarificationMotorAuspuff";
  return "clarificationGeneric";
}

function buildItemLine(item: DraftItem, locale: Locale): string {
  // itemLineText() erwartet MailInquiryItem (snake_case, siehe
  // lib/mail/types.ts) - hier nur umbenannt, keine eigene Formatierung:
  // Positionszeilen im Antwortentwurf müssen exakt wie in den Mails
  // aussehen (dieselbe Vorlage draft.itemLine), ein zweites, eigenes
  // Format wäre eine Fehlerquelle bei künftigen Textänderungen.
  return itemLineText(
    {
      category: item.category,
      name: item.name,
      description: item.description,
      price_total: item.priceTotal,
      price_status: item.priceStatus,
    },
    locale,
  );
}

/** Antwortentwurf: Betreff und vollständiger Text, Absätze mit Leerzeile getrennt. */
export function buildDraft(ctx: DraftContext, locale: Locale): { subject: string; body: string } {
  const dict = getDictionary(locale);
  const d = dict.draft;

  const subject = tf(d.subject, { vehicle: ctx.vehicleLabel, number: ctx.number });

  const yearSuffix = ctx.year && !isOlderYear(ctx.year) ? tf(d.yearSuffix, { year: ctx.year }) : "";
  const thanksParagraph = `${tf(d.thanks, { model: ctx.vehicleLabel, yearSuffix })} ${d.character[ctx.character]}`;

  // Positionen: im Kurzablauf (family.has_pricelist === false, siehe
  // CLAUDE.md "Modelle ohne Preisliste") gibt es keinen Produkt-Schritt,
  // also auch keine Preise - die Positionen werden durch die gewünschten
  // Kategorien als Wunschliste ersetzt (Aufgabenstellung: "Kurzablauf (kein
  // Modell / keine Preisliste): Positionen durch Kategorien-Wunschliste
  // ersetzen").
  let itemsParagraph: string;
  if (!ctx.hasPricelist) {
    const wishLines = ctx.categories.map((c) => `• ${categoryLabel(c, locale)}`);
    if (ctx.consulting) wishLines.push(`• ${dict.steps.done.package.adviceLine}`);
    itemsParagraph = wishLines.length > 0 ? `${d.itemsIntro}\n${wishLines.join("\n")}` : d.itemsFallback;
  } else if (ctx.items.length === 0) {
    // Preisliste vorhanden, aber nichts ausgewählt (z.B. nur "Komplettpaket,
    // beraten Sie mich" ohne konkrete Produkte) - derselbe Fallback wie
    // lib/mail/render.ts itemList() für den Fall leerer Positionen.
    itemsParagraph = d.itemsFallback;
  } else {
    const lines = ctx.items.map((item) => buildItemLine(item, locale));
    itemsParagraph = `${d.itemsIntro}\n${lines.join("\n")}`;
  }

  // Leistungs-Satz: nur bei gewählter Motor-Leistungsstufe (variant_group
  // 'leistung') mit bekanntem Zielwert (ps_to), siehe Aufgabenstellung
  // "Leistungs-Satz bei Motorstufe (ps_to/nm_to)".
  const stageItem = ctx.items.find(
    (item) => item.category === "motor" && item.variantGroup === "leistung" && item.psTo != null,
  );
  const performanceParagraph = stageItem
    ? tf(d.performanceLine, {
        stage: stageLabel(stageItem.name),
        model: ctx.vehicleLabel,
        detail:
          stageItem.nmTo != null ? `${stageItem.psTo} PS / ${stageItem.nmTo} Nm` : `${stageItem.psTo} PS`,
      })
    : null;

  // Richtpreis-Satz mit Vorbehalt: priceLine enthält bereits BEIDE Sätze
  // ("Richtpreis ...", "Den definitiven Preis bestätige ich Ihnen, sobald
  // {clarification}.") als eine zusammenhängende Vorlage, siehe der
  // Kommentar über draft.priceLine in lib/i18n/de.ts ("{clarification} ist
  // bereits ein vollständiger Nebensatz ... kein eigenes 'wir ... geklärt
  // haben' mehr drumherum bauen"). Ohne bekannte Summe (Kurzablauf, oder
  // Preisliste vorhanden aber alle gewählten Positionen "in Vorbereitung"/
  // "auf Anfrage" ohne price_total) ersetzt draft.priceLineOnRequest laut
  // dortigem Kommentar ("ersetzt priceLine VOLLSTÄNDIG statt {price} leer
  // zu lassen") die gesamte Vorlage inklusive der Klärungs-Nebensatz-Hälfte
  // - priceLineOnRequest ist selbst schon ein vollständiger, in sich
  // stimmiger Vorbehalts-Satz ("... nach kurzer Prüfung ..."), ein
  // zusätzlicher {clarification}-Nebensatz hat dafür keine eigene Vorlage
  // und würde angehängt grammatisch nicht mehr passen (zwei Satzenden ohne
  // Verbindung). Diese Lesart ist eine bewusste Entscheidung gegen den
  // Wortlaut der Aufgabenstellung ("priceLineOnRequest + clarification"),
  // siehe Bericht.
  const clarification = d[clarificationKey(ctx.categories)];
  const priceParagraph =
    ctx.estimatedTotal != null
      ? tf(d.priceLine, { price: chfFrom(ctx.estimatedTotal, locale), clarification })
      : d.priceLineOnRequest;

  const timingParagraph =
    ctx.timing === "flexible"
      ? d.timingFlexible
      : tf(d.timingFixed, { timing: d.timingPhrases[ctx.timing as "asap" | "m1_2" | "m3_6"] });

  // {company}: bewusst settings.company_address (nicht settings.
  // mail_from_name), damit draft.signature exakt so befüllt wird wie in
  // lib/mail/templates/follow_up.ts (dieselbe Vorlage, dieselbe Zuordnung
  // company -> companyAddress). Mit mail_from_name (wie eine frühere Fassung
  // dieser Aufgabenstellung nahelegte) hätte derselbe Signatur-Baustein je
  // nach Mailtyp eine andere Firmenzeile gezeigt (Antwort "dÄHLer
  // Competition Line AG", Follow-up "dÄHLer Competition Line AG, Belp").
  const signature = tf(d.signature, {
    name: ctx.settings.signatureName,
    company: ctx.settings.companyAddress,
    phone: ctx.settings.signaturePhone,
  });
  const closingParagraph = `${d.signOff}\n${signature}`;

  const paragraphs = [
    tf(d.greeting, { first: ctx.firstName, last: ctx.lastName }),
    thanksParagraph,
    itemsParagraph,
    performanceParagraph,
    priceParagraph,
    timingParagraph,
    d.closingCall,
    closingParagraph,
  ].filter((p): p is string => !!p);

  return { subject, body: paragraphs.join("\n\n") };
}
