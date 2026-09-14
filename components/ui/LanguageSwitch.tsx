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
            "rounded-full px-3.5 py-1.5 font-display text-[13px] font-semibold uppercase tracking-[0.08em]",
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
