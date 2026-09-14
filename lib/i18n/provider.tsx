"use client";

// Client-seitiger Sprachkontext: liest/schreibt Cookie "lang" (max-age 1
// Jahr), stellt Dictionary und Interpolations-Helfer über useT() bereit.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_LOCALE, getDictionary, isLocale, tf } from "./dictionaries";
import type { Dictionary, Locale } from "./dictionaries";

const COOKIE_NAME = "lang";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 Jahr

function readCookieLocale(): Locale | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)lang=([^;]*)/);
  const value = match ? decodeURIComponent(match[1]) : undefined;
  return isLocale(value) ? value : null;
}

function writeCookieLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${locale}; max-age=${COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax`;
}

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dictionary: Dictionary;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Nach der Hydration das Cookie als Quelle der Wahrheit übernehmen, falls
  // es vom Server-Wert abweicht (z.B. nach Umschalten auf einem anderen Tab).
  useEffect(() => {
    const fromCookie = readCookieLocale();
    if (fromCookie && fromCookie !== locale) {
      setLocaleState(fromCookie);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeCookieLocale(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, dictionary: getDictionary(locale) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale muss innerhalb von <LocaleProvider> verwendet werden.");
  }
  return ctx;
}

/** Kurzform: { t, tf, locale } für Komponenten, die Texte ausgeben. */
export function useT() {
  const { dictionary, locale } = useLocale();
  return { t: dictionary, tf, locale };
}
