"use client";

import { useLocale } from "@/lib/i18n/provider";

/** Sprachumschalter DE | EN, Segment-Optik wie .seg in der Vorschau. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { locale, setLocale, dictionary } = useLocale();

  return (
    <div
      role="group"
      aria-label={dictionary.language.switchLabel}
      className={[
        "inline-flex rounded-full border border-line-alt bg-bg p-[3px]",
        className,
      ].join(" ")}
    >
      {(["de", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
          className={[
            // min-h-11/min-w-11 (44px): Touch-Fläche (Prüfbefund flow, Punkt
            // 7) - "DE"/"EN" sind nur 2 Zeichen breit, px-3.5 allein käme
            // ohne min-w-11 auf ~42px, knapp unter 44px. px/py bleiben wie
            // zuvor, inline-flex+items-center zentriert den Text in der
            // grösseren Fläche, ohne Farbe/Schrift/Radius zu ändern.
            "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3.5 py-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.08em]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2",
            locale === code ? "bg-red text-white" : "bg-transparent text-muted",
          ].join(" ")}
        >
          {dictionary.language[code]}
        </button>
      ))}
    </div>
  );
}
