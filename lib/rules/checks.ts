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
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { Character, FlowCategory, PriceStatus, Timing } from "@/lib/supabase/rows";

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
  variantGroup: string | null;
  priceStatus: PriceStatus;
  psTo: number | null;
}

export interface CheckFamily {
  hasPricelist: boolean;
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

/**
 * Die Regeln aus CLAUDE.md ("Motor und Auspuff gewählt", "Stufe 2 ohne
 * Hochleistungskats", ...) plus die drei aus docs/architektur.md
 * (familie_ohne_preisliste, produkt_auf_anfrage, komplettpaket_gewuenscht).
 * Reihenfolge = Ausgabereihenfolge.
 */
export const CHECK_RULES: Array<{ id: string; when: (ctx: CheckContext) => boolean }> = [
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
];

/** Wertet alle CHECK_RULES gegen ctx aus und liefert die lokalisierten Treffer. */
export function runChecks(ctx: CheckContext, locale: Locale): CheckResult[] {
  const dict = getDictionary(locale);
  const checks = dict.checks as Record<string, string>;
  const results: CheckResult[] = [];
  for (const rule of CHECK_RULES) {
    if (!rule.when(ctx)) continue;
    const text = checks[rule.id];
    if (!text) {
      // Sollte durch die vollständigen Dictionaries nie eintreten; ein
      // fehlender Text darf trotzdem nicht die ganze Anfrage zum Absturz
      // bringen (siehe lib/inquiry/create.ts: die Anfrage muss immer
      // gespeichert werden können).
      console.error(`runChecks: kein Text für Prüfhinweis "${rule.id}" (locale ${locale}).`);
      continue;
    }
    results.push({ id: rule.id, text });
  }
  return results;
}
