// Zentraler i18n-Einstiegspunkt. Reine Teile aus dictionaries.ts, Client-
// Kontext aus provider.tsx, dazu der Server-Helfer getLocaleFromCookies().
// Kein "use client" hier: Server Components importieren gefahrlos auch
// getLocaleFromCookies, Client Components nutzen LocaleProvider/useT.
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale } from "./dictionaries";
import type { Locale } from "./dictionaries";

export type { Dictionary, Locale } from "./dictionaries";
export { LOCALES, DEFAULT_LOCALE, getDictionary, isLocale, tf } from "./dictionaries";
export { LocaleProvider, useLocale, useT } from "./provider";

/** Liest die Sprache aus dem Cookie "lang" (Server Components / Route Handlers). */
export async function getLocaleFromCookies(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get("lang")?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
