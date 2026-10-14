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
import { displayItemFields, isStandaloneVmaxProduct, stageShortTitle } from "@/lib/catalog/product-display";
import type { TranslationMap } from "@/lib/translations/resolve";
import { fillMailText, resolveMailTexts } from "@/lib/mail/texts";
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
  /** Rohe settings mit den Admin-Mailtexten (lib/mail/texts.ts), leer = Standardtexte. */
  texts?: Partial<Record<string, string>>;
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
  /**
   * Entscheid 21.09.2026 (Posten 4): Übersetzungen der Positionstexte für
   * die Sprache des Entwurfs (lib/translations/resolve.ts), null bei Deutsch
   * oder ohne Einträge - die Positionszeilen zeigen dann die Excel-Texte.
   */
  translations?: TranslationMap | null;
}

// "älter" (de) / "older" (en), siehe lib/rules/checks.ts (gleiche
// Begründung: steps.car.yearOlder ist kein sprachneutraler Wert).
const YEAR_OLDER_VALUES = new Set(
  [de.steps.car.yearOlder, en.steps.car.yearOlder].map((v) => v.trim().toLowerCase()),
);

function isOlderYear(year: string | null): boolean {
  return !!year && YEAR_OLDER_VALUES.has(year.trim().toLowerCase());
}

/** "Stufe 1"/"Stage 1" (lokalisiert, lib/catalog/product-display.ts
 * stageShortTitle()) aus dem deutschen Excel-Produktnamen für
 * performanceLine {stage}; ohne erkennbare Stufennummer der lokalisierte
 * Rückfall "Leistungssteigerung"/"Power increase" - wie die Kachel und die
 * Positionszeile, nie ein leerer Platzhalter. Vorher stand hier auch im
 * englischen Entwurf "Stufe 1" (Posten 4). */
function stageLabel(name: string, locale: Locale): string {
  return stageShortTitle(name, locale);
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
function buildItemLine(item: DraftItem, locale: Locale, translations?: TranslationMap | null): string {
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
    translations,
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
    { grouped: true },
  );
}

/**
 * Gewählte Kategorien ohne ausgewähltes Produkt (Rückmeldung dÄHLer
 * 14.10.2026, Anfrage 2026-0016: Motor, Auspuff, Fahrwerk gewählt, aber nur
 * bei Räder ein Produkt angetippt). Erscheinen im Entwurf als Bereich mit
 * Beratungszeile statt stillschweigend zu fehlen.
 */
export function categoriesWithoutItems(
  categories: readonly FlowCategory[],
  items: readonly { category: FlowCategory }[],
): FlowCategory[] {
  return categories.filter((c) => !items.some((item) => item.category === c));
}

/** Antwortentwurf: Betreff und vollständiger Text, Absätze mit Leerzeile getrennt. */
export function buildDraft(ctx: DraftContext, locale: Locale): { subject: string; body: string } {
  const dict = getDictionary(locale);
  const d = dict.draft;
  // Rückmeldung dÄHLer 14.10.2026: Einleitung, Charaktersatz, Überleitung
  // zum Angebot, Terminsatz und Schluss pflegt der Kunde im Admin
  // (lib/mail/texts.ts), Positionen, Leistung und Richtpreis baut das Tool.
  const texts = resolveMailTexts(locale, ctx.settings.texts);

  const subject = tf(d.subject, { vehicle: ctx.vehicleLabel, number: ctx.number });

  const yearSuffix = ctx.year && !isOlderYear(ctx.year) ? tf(d.yearSuffix, { year: ctx.year }) : "";
  const vars = {
    vorname: ctx.firstName,
    name: ctx.lastName,
    fahrzeug: ctx.vehicleLabel,
    jahrgang: yearSuffix,
    nummer: ctx.number,
  };
  const introParagraph = fillMailText(texts.text_draft_intro, vars);

  // character ist im Schnellweg optional (null), dann entfällt der Satz.
  const characterText = ctx.character ? fillMailText(texts[`text_draft_character_${ctx.character}`], vars) : "";
  const itemsIntro = fillMailText(texts.text_draft_items_intro, vars);

  // Positionen, nach Bereich gruppiert («Motor», darunter je Produkt eine
  // Zeile mit Strich), Wunsch von dÄHLer 14.10.2026 (übersichtlicher mit
  // Aufzählung). Kurzablauf ohne Preisliste: nur die gewünschten Bereiche.
  let itemsBlock: string;
  if (!ctx.hasPricelist) {
    const wishLines = ctx.categories.map((c) => `- ${categoryLabel(c, locale)}`);
    if (ctx.consulting) wishLines.push(`- ${dict.steps.done.package.adviceLine}`);
    itemsBlock = wishLines.length > 0 ? wishLines.join("\n") : d.itemsFallback;
  } else if (ctx.items.length === 0 && ctx.categories.length === 0) {
    itemsBlock = d.itemsFallback;
  } else {
    const order: FlowCategory[] = [...ctx.categories];
    for (const item of ctx.items) if (!order.includes(item.category)) order.push(item.category);
    const blocks = order.map((category) => {
      const lines = ctx.items
        .filter((item) => item.category === category)
        .map((item) => buildItemLine(item, locale, ctx.translations));
      const body = lines.length > 0 ? lines.join("\n") : `- ${d.categoryAdvice}`;
      return `${categoryLabel(category, locale)}\n${body}`;
    });
    if (ctx.consulting) blocks.push(`${dict.steps.done.package.adviceLine}\n- ${d.categoryAdvice}`);
    itemsBlock = blocks.join("\n\n");
  }
  const leadParagraph = [characterText, itemsIntro].filter(Boolean).join(" ");

  // Leistungs-Satz: nur bei gewählter Motor-Leistungsstufe (variant_group
  // 'leistung') mit bekanntem Zielwert (ps_to).
  const stageItem = ctx.items.find(
    (item) => item.category === "motor" && item.variantGroup === "leistung" && item.psTo != null,
  );
  const performanceParagraph = stageItem
    ? tf(d.performanceLine, {
        stage: stageLabel(stageItem.name, locale),
        model: ctx.vehicleLabel,
        detail:
          stageItem.nmTo != null ? `${stageItem.psTo} PS / ${stageItem.nmTo} Nm` : `${stageItem.psTo} PS`,
      })
    : null;

  // Richtpreis mit Vorbehalt, der Klärungs-Nebensatz je nach Kategorien.
  const clarification = d[clarificationKey(ctx.categories)];
  const priceParagraph =
    ctx.estimatedTotal != null
      ? tf(d.priceLine, { price: chfFrom(ctx.estimatedTotal, locale), clarification })
      : tf(d.priceLineOnRequest, { clarification });

  // Terminsatz: ein Text für alle Zeiträume (Wunsch dÄHLer 14.10.2026, die
  // bisherigen Zeitraum-Varianten waren zu konkret), im Admin anpassbar.
  const timingParagraph = fillMailText(texts.text_draft_timing, vars);

  // Signatur: Name aus settings.signature_name, Firmenzeile aus
  // settings.mail_from_name plus optional company_address (companyLine()
  // dedupliziert), Telefon aus settings.signature_phone.
  const company = ctx.settings.companyName
    ? companyLine(ctx.settings.companyName, ctx.settings.companyAddress)
    : ctx.settings.companyAddress;
  const signature = tf(d.signature, {
    name: ctx.settings.signatureName,
    company,
    phone: ctx.settings.signaturePhone,
  });
  const closingParagraph = `${fillMailText(texts.text_draft_closing, vars)}\n${signature}`;

  const paragraphs = [
    introParagraph,
    leadParagraph,
    itemsBlock,
    performanceParagraph,
    priceParagraph,
    timingParagraph,
    closingParagraph,
  ].filter((p): p is string => !!p && p.trim() !== "");

  return { subject, body: paragraphs.join("\n\n") };
}
