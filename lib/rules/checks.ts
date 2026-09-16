// Prüfhinweise (regelbasiert, erweiterbar), siehe CLAUDE.md Abschnitt
// "Prüfhinweise" und docs/architektur.md Abschnitt "Prüfhinweise". Alle
// Regeln in dieser einen Datei, nicht im UI-Code verstreut (CLAUDE.md:
// "Der Kunde wird weitere liefern").
//
// Texte kommen ausschliesslich aus lib/i18n de.ts/en.ts (checks.*, siehe
// dort); die IDs dort und hier müssen exakt übereinstimmen (bereits vom
// i18n-Modul vollständig angelegt, hier nichts zu ergänzen).
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { getDictionary, tf } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/dictionaries";
import { gearboxFor } from "@/lib/catalog/gearbox";
import { vehicleAmbiguousAlternatives, vehicleLineIsAmbiguous } from "@/lib/catalog/vehicle-label";
import type { Character, FlowCategory, InquiryGearbox, PriceStatus, Timing } from "@/lib/db/rows";

/**
 * Ein vom Kunden gewähltes Produkt, wie es die Prüfregeln brauchen. Bewusst
 * camelCase (wie lib/catalog/queries.ts CatalogProduct, nicht die
 * DB-Spaltennamen): lib/inquiry/create.ts baut CheckContext direkt aus den
 * per getProductsByIds geladenen CatalogProduct-Objekten, eine eigene
 * snake_case-Zwischenform wäre nur ein zusätzlicher Mapping-Schritt ohne
 * Nutzen.
 */
export interface CheckProduct {
  category: FlowCategory;
  name: string;
  /** Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 2): einige V/max-
   * Nennungen stehen nur in der description, nicht im Namen (siehe
   * isVmaxMention() unten). */
  description: string | null;
  variantGroup: string | null;
  priceStatus: PriceStatus;
  psTo: number | null;
}

export interface CheckFamily {
  hasPricelist: boolean;
  /**
   * brand/name/codes: Ausschnitt aus VehicleLabelFamily (siehe
   * lib/catalog/vehicle-label.ts), nur für den Prüfhinweis
   * "modell_mehrdeutig" gebraucht (vehicleLineIsAmbiguous()). Ergänzung
   * 15.09.2026 (Feinschliff-Prüfung, Ambiguität X1/X2, X3/X4, X5/X6).
   */
  brand: string;
  name: string;
  codes?: string[] | null;
}

export interface CheckModel {
  id: string;
  name: string;
}

/**
 * Anfrage-Felder, die Prüfregeln brauchen (Ausschnitt aus dem validierten
 * Payload, siehe lib/inquiry/schema.ts). Kein Kontaktdaten-Feld: Prüfregeln
 * urteilen nie über Name/E-Mail/Telefon.
 */
export interface CheckInquiry {
  categories: FlowCategory[];
  consulting: boolean;
  character: Character | null;
  timing: Timing | null;
  /** Freitext-Baujahr, z.B. "2025" oder der lokalisierte Sentinel-Wert für
   * "älter" (steps.car.yearOlder in de.ts/en.ts), siehe YEAR_OLDER_VALUES. */
  year: string | null;
  /** Antwort auf die Getriebefrage (siehe components/flow/steps/CarStep.tsx),
   * null wenn die Frage nicht gestellt wurde (Modell ohne getriebespezifische
   * Produkte, oder Kurzablauf ohne Modell). Rückmeldung erster Klicktest,
   * CLAUDE.md Abschnitt "AUFGABE", Punkt 3. */
  gearbox: InquiryGearbox | null;
}

export interface CheckContext {
  inquiry: CheckInquiry;
  family: CheckFamily | null;
  model: CheckModel | null;
  /** Nur die vom Kunden gewählten Produkte (nicht der ganze Katalog). */
  products: CheckProduct[];
}

export interface CheckResult {
  id: string;
  text: string;
}

// "älter" (de) / "older" (en): steps.car.yearOlder ist bewusst KEINE
// sprachneutrale ID (anders als timing/channel/character/follow_up_answers,
// siehe docs/architektur.md Abschnitt "i18n"), sondern ein direkt aus dem
// Dictionary übernommener Auswahlwert des Baujahr-Selects im Kundenflow.
// CheckContext trägt deshalb keine locale (die Regel-Signatur ist laut
// Aufgabenstellung `when: (ctx: CheckContext) => boolean`, ohne locale-
// Parameter); um trotzdem unabhängig von der Sprache der jeweiligen Anfrage
// zu erkennen, wird gegen BEIDE bekannten Sentinel-Werte geprüft.
const YEAR_OLDER_VALUES = new Set(
  [de.steps.car.yearOlder, en.steps.car.yearOlder].map((v) => v.trim().toLowerCase()),
);

function isOlderYear(year: string | null): boolean {
  return !!year && YEAR_OLDER_VALUES.has(year.trim().toLowerCase());
}

function hasCategory(ctx: CheckContext, category: FlowCategory): boolean {
  return ctx.inquiry.categories.includes(category);
}

// Stufe-Erkennung: variant_group === 'leistung' und Name-Regex, siehe
// CLAUDE.md Abschnitt "Prüfhinweise" (Vorgabe der Aufgabenstellung).
const STUFE_1_PATTERN = /Stufe\s*1\b/i;
const STUFE_2_PATTERN = /Stufe\s*2\b/i;
// Hochleistungskats, siehe Aufgabenstellung (Regex wörtlich übernommen).
const HOCHLEISTUNGSKAT_PATTERN = /Hochleistungs.?kat/i;

function chosenLeistung(ctx: CheckContext, pattern: RegExp): boolean {
  return ctx.products.some(
    (p) => p.category === "motor" && p.variantGroup === "leistung" && pattern.test(p.name),
  );
}

function chosenHochleistungskats(ctx: CheckContext): boolean {
  return ctx.products.some((p) => HOCHLEISTUNGSKAT_PATTERN.test(p.name));
}

// Rückmeldungen aus dem ersten Klicktest (Kundenflow M2 G87), siehe
// CLAUDE.md Abschnitt "AUFGABE", Punkt 3.

/** Dieselbe V/max-Erkennung wie der Titel-Zusatz in lib/catalog/product-display.ts. */
const VMAX_MENTION_PATTERN = /V.?max/i;
const VMAX_LIFT_PATTERN = /Aufheb|Anheb|inkl/i;

function isVmaxMention(name: string): boolean {
  return VMAX_MENTION_PATTERN.test(name) && VMAX_LIFT_PATTERN.test(name);
}

// Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 2): einige Stufen
// tragen die V/max-Angabe nur in der description, nicht im Namen (z.B. weil
// die Excel-Zelle über zwei Spalten umgebrochen ist, siehe
// lib/catalog/product-display.ts stageDisplay()-Kommentar) - name und
// description deshalb hier ebenfalls als ein Text zusammen geprüft, sonst
// übersieht isVmaxMention() genau diese Fälle.
function isVmaxMentionOf(p: Pick<CheckProduct, "name" | "description">): boolean {
  return isVmaxMention(p.description ? `${p.name} ${p.description}` : p.name);
}

/** true, wenn mindestens eine gewählte Leistungsstufe die V/max-Aufhebung bereits im Namen (oder der description) trägt. */
function chosenStageWithVmax(ctx: CheckContext): boolean {
  return ctx.products.some((p) => p.category === "motor" && p.variantGroup === "leistung" && isVmaxMentionOf(p));
}

/** true, wenn zusätzlich ein EIGENSTÄNDIGES V/max-Produkt gewählt wurde (kein Leistungsstufen-Produkt selbst). */
function chosenSeparateVmaxProduct(ctx: CheckContext): boolean {
  return ctx.products.some((p) => p.category === "motor" && p.variantGroup !== "leistung" && isVmaxMentionOf(p));
}

/** true, wenn mindestens ein gewähltes Produkt getriebespezifisch ist (siehe lib/catalog/gearbox.ts). */
function hasGearboxSpecificSelection(ctx: CheckContext): boolean {
  return ctx.products.some((p) => gearboxFor(p.name) !== null);
}

/**
 * Die Regeln aus CLAUDE.md ("Motor und Auspuff gewählt", "Stufe 2 ohne
 * Hochleistungskats", ...) plus die drei aus docs/architektur.md
 * (familie_ohne_preisliste, produkt_auf_anfrage, komplettpaket_gewuenscht).
 * Reihenfolge = Ausgabereihenfolge. `vars` (optional): liefert die
 * Platzhalter-Werte für tf() (siehe runChecks()), nur "modell_mehrdeutig"
 * braucht das bisher ({alternatives}, Ergänzung 15.09.2026).
 */
export const CHECK_RULES: Array<{
  id: string;
  when: (ctx: CheckContext) => boolean;
  vars?: (ctx: CheckContext) => Record<string, string>;
}> = [
  {
    id: "motor_auspuff_compat",
    when: (ctx) => hasCategory(ctx, "motor") && hasCategory(ctx, "auspuff"),
  },
  {
    id: "stufe2_ohne_kats",
    when: (ctx) => chosenLeistung(ctx, STUFE_2_PATTERN) && !chosenHochleistungskats(ctx),
  },
  {
    id: "in_vorbereitung",
    when: (ctx) => ctx.products.some((p) => p.priceStatus === "in_preparation"),
  },
  {
    // "Serienfahrwerk adaptiv? Einbausatz nötig?" lässt sich aus den
    // gewählten Produkten nicht automatisch beantworten (keine Angabe zum
    // Serienfahrwerk in den Anfrage-Daten), siehe Aufgabenstellung:
    // "adaptives Fahrwerk über category fahrwerk" - der Hinweis feuert
    // schlicht, sobald die Kategorie Fahrwerk gewählt wurde, damit dÄHLer
    // es von Hand klärt.
    id: "fahrwerk_einbausatz",
    when: (ctx) => hasCategory(ctx, "fahrwerk"),
  },
  {
    id: "raeder_details",
    when: (ctx) => hasCategory(ctx, "raeder"),
  },
  {
    id: "exterieur_lack",
    when: (ctx) => hasCategory(ctx, "exterieur"),
  },
  {
    id: "baujahr_homologation",
    when: (ctx) => isOlderYear(ctx.inquiry.year),
  },
  {
    id: "charakter_maximum_stufe1",
    when: (ctx) => ctx.inquiry.character === "maximum" && chosenLeistung(ctx, STUFE_1_PATTERN),
  },
  {
    id: "zeitraum_kapazitaet",
    when: (ctx) => ctx.inquiry.timing === "asap",
  },
  {
    id: "familie_ohne_preisliste",
    when: (ctx) => ctx.family !== null && ctx.family.hasPricelist === false,
  },
  {
    id: "produkt_auf_anfrage",
    when: (ctx) => ctx.products.some((p) => p.priceStatus === "on_request"),
  },
  {
    id: "komplettpaket_gewuenscht",
    when: (ctx) => ctx.inquiry.consulting === true,
  },
  {
    // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
    // ein getriebespezifisches Produkt wurde gewählt, aber die Getriebefrage
    // ist unbeantwortet (null, Frage nie gestellt) oder ausdrücklich mit
    // "Weiss ich nicht" beantwortet ("unknown") - dÄHLer muss das Getriebe
    // vor der Bestätigung klären.
    id: "getriebe_unbekannt",
    when: (ctx) => (ctx.inquiry.gearbox === null || ctx.inquiry.gearbox === "unknown") && hasGearboxSpecificSelection(ctx),
  },
  {
    // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
    // die gewählte Leistungsstufe enthält die V/max-Aufhebung bereits
    // (Name z.B. "... inkl. Anhebung der V/max Begrenzung"), UND zusätzlich
    // wurde das eigenständige V/max-Produkt ("Aufhebung der serienmässigen
    // V/max Begrenzung") gewählt - doppelt, dÄHLer soll das vor der
    // Bestätigung bereinigen.
    id: "vmax_doppelt",
    when: (ctx) => chosenStageWithVmax(ctx) && chosenSeparateVmaxProduct(ctx),
  },
  {
    // Feinschliff-Prüfung 15.09.2026 (Ambiguität X1/X2, X3/X4, X5/X6, siehe
    // docs/architektur.md Abschnitt "Fahrzeugbezeichnung"): die Formel kann
    // die Alternative einer Baureihe nicht auflösen, wenn die Motorisierung
    // mit keiner ein Wort teilt - dann wählt sie stillschweigend die erste
    // Alternative, ohne Grundlage, welches der Modelle der Kunde hat.
    // Ausnahme 8er/M8 (vehicleLineIsAmbiguous()): eine Alternative, die
    // selbst ein M-Modell bezeichnet, zählt nicht mit, wenn die
    // Motorisierung selbst kein M-Modell ist - "8er" + "40i" feuert darum
    // nicht. {alternatives} (vars unten) nennt die konkreten Alternativen
    // ("X1 / X2") statt eines generischen Beispiels.
    id: "modell_mehrdeutig",
    when: (ctx) => ctx.family !== null && ctx.model !== null && vehicleLineIsAmbiguous(ctx.family, ctx.model),
    vars: (ctx) => ({
      alternatives: ctx.family && ctx.model ? vehicleAmbiguousAlternatives(ctx.family, ctx.model).join(" / ") : "",
    }),
  },
];

/** Wertet alle CHECK_RULES gegen ctx aus und liefert die lokalisierten Treffer. */
export function runChecks(ctx: CheckContext, locale: Locale): CheckResult[] {
  const dict = getDictionary(locale);
  const checks = dict.checks as Record<string, string>;
  const results: CheckResult[] = [];
  for (const rule of CHECK_RULES) {
    if (!rule.when(ctx)) continue;
    const template = checks[rule.id];
    if (!template) {
      // Sollte durch die vollständigen Dictionaries nie eintreten; ein
      // fehlender Text darf trotzdem nicht die ganze Anfrage zum Absturz
      // bringen (siehe lib/inquiry/create.ts: die Anfrage muss immer
      // gespeichert werden können).
      console.error(`runChecks: kein Text für Prüfhinweis "${rule.id}" (locale ${locale}).`);
      continue;
    }
    // {alternatives} & Co. (siehe CHECK_RULES.vars): dieselbe Platzhalter-
    // Ersetzung wie draft/template.ts (tf(), lib/i18n/dictionaries.ts).
    const text = rule.vars ? tf(template, rule.vars(ctx)) : template;
    results.push({ id: rule.id, text });
  }
  return results;
}
