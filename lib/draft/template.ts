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
import { categoryLabel, companyLine, itemLineText } from "@/lib/mail/render";
import { displayItemFields, isStandaloneVmaxProduct } from "@/lib/catalog/product-display";
import type { Character, FlowCategory, PriceStatus, Timing } from "@/lib/db/rows";

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
  /**
   * Firmenname für die Signatur (settings.mail_from_name), Prüfung Phase B
   * Punkt 6. Optional, damit lib/inquiry/create.ts (ausserhalb der mir für
   * diese Aufgabe zugewiesenen Dateien, siehe Bericht) unverändert bleibt,
   * solange es companyName dort noch nicht mitliefert: ohne companyName
   * fällt buildDraft() auf das bisherige Verhalten zurück (nur
   * companyAddress als Firmenzeile, siehe dortiger Kommentar).
   */
  companyName?: string;
  /** settings.company_address, wird in der Signatur nur angehängt, wenn gesetzt. */
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
  /**
   * null im Schnellweg (Posten 3), wenn das Sprachmodell keinen Charakter
   * extrahieren konnte und der Admin ihn (noch) nicht nachgetragen hat
   * (siehe lib/ai/to-payload.ts QuickInquiryPayloadSchema, Prüfung Phase B
   * Punkt 7). buildDraft() lässt den Charakter-Satz dann einfach weg statt
   * `d.character[null]` (undefined) einzusetzen.
   */
  character: Character | null;
  categories: FlowCategory[];
  consulting: boolean;
  /** null im Schnellweg, siehe character oben; buildDraft() verwendet dann einen neutralen Satz (draft.timingUnknown). */
  timing: Timing | null;
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

/**
 * Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
 * Positionszeilen wie «Motor: Stufe 1 (590 PS / 720 Nm, M6 & A8-Getriebe),
 * ab CHF 4'180» statt des vollen, mehrdeutigen Excel-Rohnamens - über
 * lib/catalog/product-display.ts displayItemFields(), die Titel/Nebenzeile/
 * Detail einer Motor-Leistungsstufe (variant_group "leistung") zu einem
 * Namen zusammenfaltet; alle anderen Positionen bleiben unverändert (nur
 * NBSP-normalisiert). itemLineText() (lib/mail/render.ts) bleibt
 * unverändert - sie bekommt hier bereits fertig aufbereitete name/
 * description-Werte, dieselbe Vorlage draft.itemLine wie zuvor.
 */
function buildItemLine(item: DraftItem, locale: Locale): string {
  // Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 1): ein
  // eigenständiges V/max-Produkt "... ohne Leistungssteigerung" trägt zwar
  // variant_group "leistung" (Exklusivität, siehe variant-groups.ts), ist
  // aber keine Stufe - ohne die Ausnahme landete hier trotzdem der
  // Stufen-Titel ("Leistungssteigerung mit V/max-Aufhebung") im
  // Antwortentwurf statt des tatsächlichen Produktnamens.
  const isStage =
    item.category === "motor" && item.variantGroup === "leistung" && !isStandaloneVmaxProduct(item.name);
  const display = displayItemFields(
    {
      name: item.name,
      description: item.description,
      isStage,
      psTo: item.psTo,
      nmTo: item.nmTo,
    },
    locale,
  );
  return itemLineText(
    {
      category: item.category,
      name: display.name,
      description: display.description,
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
  // Prüfung Phase B, Punkt 7: character ist im Schnellweg optional (null),
  // wenn das Sprachmodell keinen erkennen konnte (siehe DraftContext.character-
  // Kommentar). Ohne character bleibt der Charakter-Satz einfach weg statt
  // `d.character[null]` (undefined, ergäbe "... Modell. undefined").
  const thanksBase = tf(d.thanks, { model: ctx.vehicleLabel, yearSuffix });
  const thanksParagraph = ctx.character ? `${thanksBase} ${d.character[ctx.character]}` : thanksBase;

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

  // Richtpreis-Satz mit Vorbehalt. Prüfung Phase B, Punkt 6 (korrigiert eine
  // frühere, bewusste Abweichung von der Vorschau, siehe docs/vorschau.html
  // draft(): dort ist der Satz EIN durchgehendes Template ("Richtpreis für
  // das Paket: {ab CHF x / nennen wir dir nach kurzer Prüfung}, inklusive
  // Einbau, ohne MFK. Den definitiven Preis bestätige ich dir, sobald
  // {clarification}.") - der Klärungs-Nebensatz gehört in BEIDEN Fällen
  // dazu, nicht nur wenn eine Summe bekannt ist. draft.priceLine und
  // draft.priceLineOnRequest tragen deshalb jetzt beide {clarification} als
  // eigenen, vollständigen zweiten Satz.
  const clarification = d[clarificationKey(ctx.categories)];
  const priceParagraph =
    ctx.estimatedTotal != null
      ? tf(d.priceLine, { price: chfFrom(ctx.estimatedTotal, locale), clarification })
      : tf(d.priceLineOnRequest, { clarification });

  // Prüfung Phase B, Punkt 7: timing ist im Schnellweg optional (null), wenn
  // das Sprachmodell keinen Zeitraum erkennen konnte (siehe DraftContext.
  // timing-Kommentar). draft.timingUnknown ist ein neutraler Satz, der ohne
  // Zeitraumangabe an dessen Stelle tritt.
  const timingParagraph =
    ctx.timing == null
      ? d.timingUnknown
      : ctx.timing === "flexible"
        ? d.timingFlexible
        : tf(d.timingFixed, { timing: d.timingPhrases[ctx.timing] });

  // Prüfung Phase B, Punkt 6: Firmenname aus settings.mail_from_name
  // (ctx.settings.companyName), die Adresse (companyAddress) wird nur
  // angehängt, wenn gesetzt (siehe docs/vorschau.html draft(): die Signatur
  // zeigt dort ohne Adresse nur "dÄHLer Competition Line AG · Telefon").
  // Ohne companyName (lib/inquiry/create.ts liefert es noch nicht, siehe
  // DraftSettings-Kommentar) bleibt es beim bisherigen Verhalten
  // (companyAddress allein als Firmenzeile). Über companyLine()
  // (lib/mail/render.ts), damit ein künftig doch übergebenes companyName
  // nicht doppelt erscheint, wenn companyAddress ihn (wie der ausgelieferte
  // Seed-Wert "dÄHLer Competition Line AG, Belp") bereits selbst enthält -
  // Befund «polish» #1, dieselbe Korrektur wie in
  // lib/mail/templates/follow_up.ts.
  const company = ctx.settings.companyName
    ? companyLine(ctx.settings.companyName, ctx.settings.companyAddress)
    : ctx.settings.companyAddress;
  const signature = tf(d.signature, {
    name: ctx.settings.signatureName,
    company,
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
