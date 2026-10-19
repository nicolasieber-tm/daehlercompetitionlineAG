"use client";

// Mailtexte bearbeiten (Einstellungen): Einleitung und Schluss der
// Bestätigungsmail, Bausteine des Antwortentwurfs. Rückmeldung dÄHLer
// 14.10.2026: der Kunde formuliert diese Texte selbst, Positionen, Preise
// und Vorher/Nachher baut das Tool weiterhin. Je Sprache eine Fassung,
// umschaltbar (Wunsch 17.10.2026, englische Anfragen, Posten 4). Siehe
// lib/mail/texts.ts.
import { useState, useTransition } from "react";
import { admin } from "@/lib/i18n/admin";
import { Button } from "@/components/ui";
import { saveSettingsAction } from "@/app/admin/actions/settings";
import { DEFAULT_MAIL_TEXTS, MAIL_TEXT_KEYS, MAIL_TEXT_PLACEHOLDERS, mailTextSettingKey } from "@/lib/mail/texts";
import type { MailTextKey, MailTexts } from "@/lib/mail/texts";
import type { Locale } from "@/lib/i18n/dictionaries";

const LOCALES: Locale[] = ["de", "en"];
import { FormField } from "./FormField";
import { useToast } from "./Toast";

const t = admin.settings.mailTexts;

export function MailTextsForm({ values }: { values: Record<Locale, MailTexts> }) {
  const { showToast } = useToast();
  const [all, setAll] = useState<Record<Locale, MailTexts>>(values);
  const [locale, setLocale] = useState<Locale>("de");
  const texts = all[locale];
  const defaults = DEFAULT_MAIL_TEXTS[locale];
  const setTexts = (update: (prev: MailTexts) => MailTexts) =>
    setAll((prev) => ({ ...prev, [locale]: update(prev[locale]) }));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // Unveränderte Standardtexte nicht speichern (leer = Standard), damit
    // spätere Verbesserungen am Standardtext bei ihm ankommen.
    // Beide Sprachen auf einmal, damit ein Wechsel des Umschalters vor dem
    // Speichern nichts verliert.
    const payload: Record<string, string> = {};
    for (const loc of LOCALES) {
      for (const key of MAIL_TEXT_KEYS) {
        const value = all[loc][key].trim();
        payload[mailTextSettingKey(key, loc)] = value === DEFAULT_MAIL_TEXTS[loc][key].trim() ? "" : value;
      }
    }
    startTransition(async () => {
      const result = await saveSettingsAction(payload);
      if (result.ok) {
        showToast(t.saved, "success");
      } else {
        setError(result.error);
        showToast(result.error, "error");
      }
    });
  }

  function field(key: MailTextKey, rows: number) {
    const isDefault = texts[key].trim() === defaults[key].trim();
    return (
      <div key={`${locale}-${key}`} className="flex flex-col gap-1">
        <FormField
          as="textarea"
          label={t.fields[key].label}
          help={t.fields[key].help}
          inputProps={{
            value: texts[key],
            onChange: (e) => setTexts((prev) => ({ ...prev, [key]: e.target.value })),
            rows,
            disabled: pending,
          }}
        />
        {!isDefault && (
          <button
            type="button"
            onClick={() => setTexts((prev) => ({ ...prev, [key]: defaults[key] }))}
            className="self-start text-xs text-muted underline hover:text-text"
          >
            {t.restoreDefault}
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-3xl flex-col gap-6">
      <p className="text-sm text-muted">
        {t.intro} {t.placeholders}{" "}
        {MAIL_TEXT_PLACEHOLDERS.map((p, i) => (
          <span key={p}>
            <code className="text-text">{`{{${p}}}`}</code>
            {i < MAIL_TEXT_PLACEHOLDERS.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>

      <div className="flex flex-col gap-2">
        <div role="tablist" aria-label={t.languageLabel} className="flex gap-2">
          {LOCALES.map((loc) => (
            <button
              key={loc}
              type="button"
              role="tab"
              aria-selected={locale === loc}
              onClick={() => setLocale(loc)}
              className={[
                "rounded-[2px] border px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.08em]",
                locale === loc ? "border-red bg-red text-white" : "border-line-alt text-muted hover:text-text",
              ].join(" ")}
            >
              {t.languages[loc]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{t.languageHint[locale]}</p>
      </div>

      <div className="flex flex-col gap-5">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-text">{t.confirmationTitle}</h3>
        {field("text_confirmation_intro", 4)}
        {field("text_confirmation_lead", 3)}
        {field("text_confirmation_closing", 6)}
      </div>

      <div className="flex flex-col gap-5">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.08em] text-text">{t.draftTitle}</h3>
        {field("text_draft_intro", 4)}
        {field("text_draft_character_dezent", 2)}
        {field("text_draft_character_sportlich", 2)}
        {field("text_draft_character_maximum", 2)}
        {field("text_draft_items_intro", 2)}
        {field("text_draft_timing", 3)}
        {field("text_draft_closing", 5)}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-bright">
          {error}
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}
