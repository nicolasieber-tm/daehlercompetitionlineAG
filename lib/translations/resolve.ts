// Reine Auflösungs-Logik für übersetzte Produkttexte (Entscheid 21.09.2026,
// Posten 4): kein DB-/Netzwerkzugriff, keine React-Hooks - wird sowohl im
// Kundenflow (Client, components/flow/**) als auch serverseitig (Mails,
// Antwortentwurf, Teilen-Seite) verwendet. Die Excel-Produkttexte bleiben
// die Quelle (deutsch); eine TranslationMap ordnet dem NORMALISIERTEN
// Quelltext die Übersetzung zu. Fehlt ein Eintrag, bleibt der deutsche
// Text stehen (nie ein leerer Platzhalter).
//
// Normalisierung (normalizeSourceText): dieselbe Funktion schlüsselt beim
// Sammeln (lib/translations/texts.ts), beim Speichern
// (lib/translations/store.ts) und beim Nachschlagen (translateText) - eine
// abweichende Schreibweise von Leerzeichen/NBSP in der Excel darf nie zu
// einem "fehlt"-Treffer führen.

/** Normalisierter Quelltext -> Übersetzung, für EINE Zielsprache. */
export type TranslationMap = Record<string, string>;

/** Für Aufrufer, die eine Map durchreichen müssen, aber keine haben (Deutsch). */
export const EMPTY_TRANSLATIONS: TranslationMap = Object.freeze({}) as TranslationMap;

/**
 * Schlüsselform eines Quelltexts: NBSP zu Leerzeichen, je Zeile
 * Mehrfach-Leerzeichen zusammengefasst und getrimmt, Leerzeilen entfernt,
 * Zeilenumbrüche (Beschreibungen mit mehreren Zeilen, z.B. Reifendimensionen)
 * bleiben als "\n" erhalten.
 */
export function normalizeSourceText(text: string): string {
  return text
    .replace(/ /g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Liefert die Übersetzung von `text` aus `map`, sonst den (unveränderten)
 * Text selbst. null/undefined/leer bleiben, was sie sind.
 */
export function translateText(text: string, map: TranslationMap | undefined | null): string;
export function translateText(text: string | null | undefined, map: TranslationMap | undefined | null): string | null | undefined;
export function translateText(
  text: string | null | undefined,
  map: TranslationMap | undefined | null,
): string | null | undefined {
  if (text == null || text === "" || !map) return text;
  const key = normalizeSourceText(text);
  if (!key) return text;
  const hit = map[key];
  return hit && hit.trim().length > 0 ? hit : text;
}

/** true, wenn `map` für `text` eine Übersetzung kennt. */
export function hasTranslation(text: string, map: TranslationMap | undefined | null): boolean {
  if (!map) return false;
  const key = normalizeSourceText(text);
  return !!key && typeof map[key] === "string" && map[key].trim().length > 0;
}

/** Nur die Einträge von `map` behalten, deren Schlüssel in `sourceTexts` vorkommen (Snapshot für inquiries.translations). */
export function pickTranslations(map: TranslationMap, sourceTexts: readonly string[]): TranslationMap {
  const out: TranslationMap = {};
  for (const text of sourceTexts) {
    const key = normalizeSourceText(text);
    if (key && typeof map[key] === "string" && map[key].trim().length > 0) out[key] = map[key];
  }
  return out;
}

/**
 * inquiries.translations ({"en": {Quelltext: Übersetzung}}, siehe
 * db/migrations/0006) für die gewünschte Sprache; null bei Deutsch, bei
 * älteren Anfragen ohne Spalteninhalt oder bei fremder Struktur (defensiv,
 * kein throw: eine kaputte Map darf weder Mailversand noch Teilen-Seite
 * verhindern, es bleibt dann beim deutschen Text).
 */
export function parseStoredTranslations(raw: unknown, locale: string): TranslationMap | null {
  if (locale === "de" || !raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const perLocale = (raw as Record<string, unknown>)[locale];
  if (!perLocale || typeof perLocale !== "object" || Array.isArray(perLocale)) return null;
  const map: TranslationMap = {};
  for (const [key, value] of Object.entries(perLocale as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) map[key] = value;
  }
  return Object.keys(map).length > 0 ? map : null;
}
