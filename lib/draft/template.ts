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
import { chf, chfFrom } from "@/lib/i18n/format";
import { categoryLabel, companyLine, itemLineText, stripConsistsOf } from "@/lib/mail/render";
import { anredeText, modellLabel } from "@/lib/mail/anrede";
import { formatWheelDimensionLine } from "@/lib/catalog/wheel-dimensions";
import { displayItemFields, isStandaloneVmaxProduct, stageShortTitle } from "@/lib/catalog/product-display";
import type { TranslationMap } from "@/lib/translations/resolve";
import { fillMailText, resolveMailTexts } from "@/lib/mail/texts";
import { emphasisText } from "@/lib/mail/emphasis";
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
  /** Optionale Anrede (herr | frau) für {{anrede}}, null/fehlend = «Vorname Name» (lib/mail/anrede.ts). */
  salutation?: string | null;
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
  /** Antworten auf die Folgefragen je Kategorie, für {{schwerpunkt}} (lib/mail/emphasis.ts). */
  followUpAnswers?: Partial<Record<string, string | null>> | null;
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

type QuestionKey = "text_draft_question_fahrwerk" | "text_draft_question_motor_auspuff" | "text_draft_question_generic";

/**
 * Rückfrage vor dem definitiven Preis (Rückmeldung dÄHLer 28.10.2026): Fahrwerk
 * oder Räder zuerst (adaptives M-Fahrwerk), dann Motor und Auspuff, sonst
 * allgemein. Die Texte pflegt der Kunde im Admin (lib/mail/texts.ts).
 */
function questionKey(categories: readonly FlowCategory[]): QuestionKey {
  if (categories.includes("fahrwerk") || categories.includes("raeder")) return "text_draft_question_fahrwerk";
  if (categories.includes("motor") && categories.includes("auspuff")) return "text_draft_question_motor_auspuff";
  return "text_draft_question_generic";
}

/**
 * Räder-Dimensionen als Achszeilen (lib/catalog/wheel-dimensions.ts), nur bei
 * Räder-Positionen und nur, wenn mindestens eine Excel-Zeile strikt dem Muster
 * entspricht. Nicht passende Zeilen bleiben wörtlich (Excel-Text), sonst null
 * und die Position wird wie bisher dargestellt.
 */
function wheelDimensionLines(item: DraftItem, locale: Locale): string[] | null {
  if (item.category !== "raeder" || !item.description) return null;
  const lines = item.description
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const formatted = lines.map((line) => formatWheelDimensionLine(line, locale));
  if (!formatted.some((line) => line !== null)) return null;
  return lines.map((line, i) => formatted[i] ?? line);
}

function displayFor(item: DraftItem, locale: Locale, translations?: TranslationMap | null) {
  // Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 1): ein
  // eigenständiges V/max-Produkt "... ohne Leistungssteigerung" trägt zwar
  // variant_group "leistung" (Exklusivität, siehe variant-groups.ts), ist
  // aber keine Stufe - ohne die Ausnahme landete hier trotzdem der
  // Stufen-Titel ("Leistungssteigerung mit V/max-Aufhebung") im
  // Antwortentwurf statt des tatsächlichen Produktnamens.
  const isStage =
    item.category === "motor" && item.variantGroup === "leistung" && !isStandaloneVmaxProduct(item.name);
  return displayItemFields(
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
  const display = displayFor(item, locale, translations);
  // Räder mit erkennbaren Dimensionszeilen: Achsen als eingerückte
  // Unterzeilen statt in Klammern (Rückmeldung dÄHLer 28.10.2026).
  const wheel = wheelDimensionLines(item, locale);
  const head = itemLineText(
    {
      category: item.category,
      name: wheel ? stripConsistsOf(display.name) : display.name,
      description: wheel ? null : display.description,
      price_total: item.priceTotal,
      price_status: item.priceStatus,
    },
    locale,
    { grouped: true },
  );
  return wheel ? [head, ...wheel.map((line) => `  ${line}`)].join("\n") : head;
}

/**
 * Empfehlungsform bei genau einer Position (Rückmeldung dÄHLer 28.10.2026,
 * Beispielmail «Unsere Empfehlung: CDC2 FORGED Schmiederadsatz»): Name,
 * Detailzeilen (bei Rädern die Achsen) und eine Preiszeile.
 */
function buildRecommendation(item: DraftItem, locale: Locale, translations?: TranslationMap | null): string {
  const d = getDictionary(locale).draft;
  const display = displayFor(item, locale, translations);
  const wheel = wheelDimensionLines(item, locale);
  const details =
    wheel ??
    (display.description ?? "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
  let price: string;
  if (item.priceStatus === "priced" && item.priceTotal != null) price = tf(d.recommendationPrice, { price: chf(item.priceTotal) });
  else if (item.priceStatus === "in_preparation") price = d.recommendationPriceInPreparation;
  else price = d.recommendationPriceOnRequest;
  return [tf(d.recommendation, { name: stripConsistsOf(display.name) }), ...details, price].join("\n");
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

/** Ein Absatz des Antwortentwurfs; `generated` = vom Tool gebaut (Positionen, Leistung, Richtpreis), sonst ein Mailtext aus dem Admin. */
export interface DraftParagraph {
  text: string;
  generated: boolean;
}

/** Antwortentwurf: Betreff und vollständiger Text, Absätze mit Leerzeile getrennt. */
export function buildDraft(ctx: DraftContext, locale: Locale): { subject: string; body: string } {
  const { subject, paragraphs } = buildDraftParagraphs(ctx, locale);
  return { subject, body: paragraphs.map((p) => p.text).join("\n\n") };
}

/**
 * Dieselben Absätze wie buildDraft(), einzeln und mit Kennzeichnung, ob sie
 * das Tool baut oder aus den Mailtexten stammen. Für die Live-Vorschau im
 * Admin (components/admin/MailTextsEditor.tsx), die so die echte Logik nutzt.
 */
export function buildDraftParagraphs(
  ctx: DraftContext,
  locale: Locale,
): { subject: string; paragraphs: DraftParagraph[] } {
  const dict = getDictionary(locale);
  const d = dict.draft;
  // Rückmeldung dÄHLer 14.10.2026: Einleitung, Überleitung zum Angebot,
  // Terminsatz und Schluss pflegt der Kunde im Admin
  // (lib/mail/texts.ts), Positionen, Leistung und Richtpreis baut das Tool.
  const texts = resolveMailTexts(locale, ctx.settings.texts);

  const subject = tf(d.subject, { vehicle: ctx.vehicleLabel, number: ctx.number });

  const yearSuffix = ctx.year && !isOlderYear(ctx.year) ? tf(d.yearSuffix, { year: ctx.year }) : "";
  const vars = {
    anrede: anredeText(ctx.salutation, ctx.firstName, ctx.lastName, locale),
    vorname: ctx.firstName,
    name: ctx.lastName,
    fahrzeug: ctx.vehicleLabel,
    modell: modellLabel(ctx.vehicleLabel),
    jahrgang: yearSuffix,
    nummer: ctx.number,
    schwerpunkt: emphasisText(ctx.categories, ctx.followUpAnswers, locale, texts),
  };
  // Entscheid 06.11.2026: Der Entwurf knüpft an die Bestätigungsmail an,
  // statt sie zu wiederholen. Satz zum Fahrzeug und Charaktersatz stehen nur
  // noch in der Bestätigung, der Entwurf geht von der Einleitung direkt zu
  // den geprüften Positionen.
  const introParagraph = fillMailText(texts.text_draft_intro, vars);
  const itemsIntro = fillMailText(texts.text_draft_items_intro, vars);

  // Positionen, nach Bereich gruppiert («Motor», darunter je Produkt eine
  // Zeile mit Strich), Wunsch von dÄHLer 14.10.2026 (übersichtlicher mit
  // Aufzählung). Kurzablauf ohne Preisliste: nur die gewünschten Bereiche.
  // Genau eine Position über alle Kategorien (ohne Kategorien ohne Produkt,
  // ohne Komplettpaket): Empfehlungsform, dann entfällt die Gesamtpaket-Preiszeile.
  const singleItem =
    ctx.hasPricelist && !ctx.consulting && ctx.items.length === 1 && categoriesWithoutItems(ctx.categories, ctx.items).length === 0
      ? ctx.items[0]
      : null;
  let itemsBlock: string;
  if (singleItem) {
    itemsBlock = buildRecommendation(singleItem, locale, ctx.translations);
  } else if (!ctx.hasPricelist) {
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

  // Richtpreis mit Vorbehalt als reine Faktenzeile (nur im Mehrfall), danach
  // die Rückfrage aus den Mailtexten. Bei genau einer Position steht der
  // Preis bereits in der Empfehlung.
  const priceParagraph = singleItem
    ? null
    : ctx.estimatedTotal != null
      ? tf(d.priceLine, { price: chfFrom(ctx.estimatedTotal, locale) })
      : d.priceLineOnRequest;
  const questionParagraph = fillMailText(texts[questionKey(ctx.categories)], vars);

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

  const paragraphs: DraftParagraph[] = (
    [
      [introParagraph, false],
      [itemsIntro, false],
      [itemsBlock, true],
      [performanceParagraph, true],
      [priceParagraph, true],
      [questionParagraph, false],
      [timingParagraph, false],
      [closingParagraph, false],
    ] as [string | null, boolean][]
  )
    .filter((entry): entry is [string, boolean] => !!entry[0] && entry[0].trim() !== "")
    .map(([text, generated]) => ({ text, generated }));

  return { subject, paragraphs };
}
