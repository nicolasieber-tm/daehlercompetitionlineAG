// Reine Dictionary-Logik ohne React und ohne next/headers, damit dieses
// Modul gefahrlos sowohl von Server- als auch von Client-Modulen importiert
// werden kann (siehe provider.tsx und index.ts).
import { de } from "./de";
import { en } from "./en";
import type { Dictionary } from "./de";

export type { Dictionary };
export type Locale = "de" | "en";

export const LOCALES: readonly Locale[] = ["de", "en"];
export const DEFAULT_LOCALE: Locale = "de";

const dictionaries: Record<Locale, Dictionary> = { de, en };

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/** Liefert das Dictionary für die angegebene Sprache, Fallback Deutsch. */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}

/**
 * Ersetzt {platzhalter} in einem Textbaustein durch Werte aus vars.
 * tf("Vielen Dank, {first}.", { first: "Max" }) -> "Vielen Dank, Max."
 * Unbekannte Platzhalter bleiben unverändert stehen.
 */
export function tf(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}
