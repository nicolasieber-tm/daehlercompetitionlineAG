"use client";

// Seite «Mailtexte»: zweispaltig, links die Textfelder in der Reihenfolge
// der Mail, rechts eine Live-Vorschau mit Beispielanfrage, die sich beim
// Tippen aktualisiert. Die Vorschau nutzt die echte Logik (lib/mail/
// preview.ts -> buildDraftParagraphs()/buildConfirmation()), nicht eine
// zweite Nachbildung. Rückmeldung dÄHLer 28.10.2026: die Texte lagen
// zuunterst in den Einstellungen, die Schwerpunkt-Wendungen waren
// unübersichtlich. Gespeichert wird wie bisher über saveSettingsAction,
// unveränderte Standardtexte als leer (= Standard).
import { useMemo, useRef, useState, useTransition } from "react";
import { admin } from "@/lib/i18n/admin";
import { de } from "@/lib/i18n/de";
import { Button } from "@/components/ui";
import { saveSettingsAction } from "@/app/admin/actions/settings";
import { DEFAULT_MAIL_TEXTS, EMPHASIS_TEXT_KEYS, MAIL_TEXT_KEYS, MAIL_TEXT_PLACEHOLDERS, mailTextSettingKey } from "@/lib/mail/texts";
import type { MailTextKey, MailTexts } from "@/lib/mail/texts";
import { PREVIEW_SCENARIO_IDS, previewConfirmation, previewDraft } from "@/lib/mail/preview";
import type { PreviewScenarioId, PreviewSignature } from "@/lib/mail/preview";
import type { Locale } from "@/lib/i18n/dictionaries";
import { FormField } from "./FormField";
import { useToast } from "./Toast";

const t = admin.mailTexts;
const LOCALES: Locale[] = ["de", "en"];

type Section = "draft" | "confirmation" | "emphasis";
const SECTIONS: Section[] = ["draft", "confirmation", "emphasis"];

/** Felder je Bereich in der Reihenfolge, in der sie in der Mail stehen. `toolAfter`: Hinweis auf Tool-Inhalt danach. */
const DRAFT_FIELDS: { key: MailTextKey; rows: number; toolAfter?: "positions" }[] = [
  { key: "text_draft_intro", rows: 4 },
  { key: "text_draft_items_intro", rows: 2, toolAfter: "positions" },
  { key: "text_draft_question_fahrwerk", rows: 4 },
  { key: "text_draft_question_motor_auspuff", rows: 3 },
  { key: "text_draft_question_generic", rows: 3 },
  { key: "text_draft_timing", rows: 4 },
  { key: "text_draft_closing", rows: 6 },
];
const CONFIRMATION_FIELDS: { key: MailTextKey; rows: number; toolAfter?: "overview" }[] = [
  { key: "text_confirmation_intro", rows: 4 },
  { key: "text_draft_character_dezent", rows: 2 },
  { key: "text_draft_character_sportlich", rows: 2 },
  { key: "text_draft_character_maximum", rows: 2 },
  { key: "text_draft_character_none", rows: 2 },
  { key: "text_confirmation_lead", rows: 3, toolAfter: "overview" },
  { key: "text_confirmation_closing", rows: 6 },
];

const CONTROL_CLASSES =
  "w-full rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text placeholder:text-dim " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-bright focus-visible:outline-offset-2";

const fieldId = (locale: Locale, key: string) => `mailtext-${locale}-${key}`;

/** «{auspuff.dezent}» in der Zeilenbeschriftung durch das Antwort-Label aus den Flow-Texten ersetzen. */
function emphasisRowLabel(key: string): string {
  const template = t.emphasis.rows[key] ?? key;
  const followUp = de.steps.category.followUp as unknown as Record<string, { options: readonly { id: string; label: string }[] }>;
  return template.replace(/\{(\w+)\.(\w+)\}/g, (_m, category: string, id: string) => {
    const label = followUp[category]?.options.find((o) => o.id === id)?.label ?? id;
    return `«${label}»`;
  });
}

export function MailTextsEditor({
  values,
  signature,
}: {
  values: Record<Locale, MailTexts>;
  signature: PreviewSignature;
}) {
  const { showToast } = useToast();
  const [all, setAll] = useState<Record<Locale, MailTexts>>(values);
  const [locale, setLocale] = useState<Locale>("de");
  const [section, setSection] = useState<Section>("draft");
  const [scenario, setScenario] = useState<PreviewScenarioId>("single");
  const [focusedKey, setFocusedKey] = useState<MailTextKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pendingCursor = useRef<{ id: string; pos: number } | null>(null);

  const texts = all[locale];
  const defaults = DEFAULT_MAIL_TEXTS[locale];

  const setText = (key: MailTextKey, value: string) =>
    setAll((prev) => ({ ...prev, [locale]: { ...prev[locale], [key]: value } }));

  // Vorschau: bei jedem Tastendruck neu aus der echten Logik berechnen.
  const preview = useMemo(
    () =>
      section === "confirmation"
        ? previewConfirmation(scenario, locale, texts)
        : previewDraft(scenario, locale, texts, signature),
    [section, scenario, locale, texts, signature],
  );

  function insertPlaceholder(placeholder: string) {
    if (!focusedKey || (EMPHASIS_TEXT_KEYS as readonly string[]).includes(focusedKey)) return;
    const id = fieldId(locale, focusedKey);
    const el = document.getElementById(id) as HTMLTextAreaElement | null;
    const current = texts[focusedKey];
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const token = `{{${placeholder}}}`;
    setText(focusedKey, current.slice(0, start) + token + current.slice(end));
    pendingCursor.current = { id, pos: start + token.length };
    // Cursor nach dem Rendern hinter den eingefügten Platzhalter setzen.
    requestAnimationFrame(() => {
      const target = pendingCursor.current;
      if (!target) return;
      const node = document.getElementById(target.id) as HTMLTextAreaElement | null;
      node?.focus();
      node?.setSelectionRange(target.pos, target.pos);
      pendingCursor.current = null;
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    // Unveränderte Standardtexte nicht speichern (leer = Standard), damit
    // spätere Verbesserungen am Standardtext bei ihm ankommen. Beide
    // Sprachen auf einmal, damit ein Wechsel des Umschalters vor dem
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

  function restoreButton(key: MailTextKey) {
    if (texts[key].trim() === defaults[key].trim()) return null;
    return (
      <button
        type="button"
        onClick={() => setText(key, defaults[key])}
        className="self-start text-xs text-muted underline hover:text-text"
      >
        {admin.mailTexts.restoreDefault}
      </button>
    );
  }

  function textField(key: MailTextKey, rows: number) {
    const def = t.fields[key];
    return (
      <div key={`${locale}-${key}`} className="flex flex-col gap-1">
        <FormField
          as="textarea"
          id={fieldId(locale, key)}
          label={def.label}
          help={def.help}
          inputProps={{
            value: texts[key],
            onChange: (e) => setText(key, e.target.value),
            onFocus: () => setFocusedKey(key),
            rows,
            disabled: pending,
          }}
        />
        {restoreButton(key)}
      </div>
    );
  }

  function toolNote(kind: "positions" | "overview") {
    return (
      <p key={`tool-${kind}`} className="border-l-2 border-line-alt bg-panel-alt px-3 py-2 text-xs text-muted">
        {t.toolBlock[kind]}
      </p>
    );
  }

  function fieldList(fields: { key: MailTextKey; rows: number; toolAfter?: "positions" | "overview" }[]) {
    return fields.flatMap((f) => [textField(f.key, f.rows), ...(f.toolAfter ? [toolNote(f.toolAfter)] : [])]);
  }

  const emphasisTable = (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t.emphasis.intro}</p>
      <div className="border border-line-alt">
        <div className="hidden grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-3 border-b border-line-alt bg-panel-alt px-3 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted md:grid">
          <span>{t.emphasis.colWhen}</span>
          <span>{t.emphasis.colPhrase}</span>
        </div>
        <ul>
          {EMPHASIS_TEXT_KEYS.map((key) => {
            const id = fieldId(locale, key);
            return (
              <li
                key={`${locale}-${key}`}
                className="grid grid-cols-1 gap-1.5 border-b border-line px-3 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-center md:gap-3"
              >
                <label htmlFor={id} className="text-sm text-text-soft">
                  {emphasisRowLabel(key)}
                </label>
                <div className="flex flex-col gap-1">
                  <input
                    id={id}
                    type="text"
                    value={texts[key]}
                    onChange={(e) => setText(key, e.target.value)}
                    onFocus={() => setFocusedKey(key)}
                    disabled={pending}
                    className={CONTROL_CLASSES}
                  />
                  {restoreButton(key)}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm text-muted">{t.intro}</p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
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
          <div role="tablist" aria-label={t.sectionsLabel} className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={section === s}
                onClick={() => {
                  setSection(s);
                  setFocusedKey(null);
                }}
                className={[
                  "border-b-2 px-1 py-1.5 font-display text-xs font-semibold uppercase tracking-[0.08em]",
                  section === s ? "border-red text-text" : "border-transparent text-muted hover:text-text",
                ].join(" ")}
              >
                {t.sections[s]}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">{t.languageHint[locale]}</p>
        <a href="#mailtext-preview" className="text-xs text-red-bright underline lg:hidden">
          {t.preview.title}
        </a>
      </div>

      {/* Platzhalter-Legende: Klick fügt an der Cursorposition des zuletzt angeklickten Felds ein. */}
      {section !== "emphasis" && (
        <div className="border border-line-alt px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted">{t.placeholders.title}</h3>
            <span className="text-xs text-dim">{focusedKey ? t.placeholders.hint : t.placeholders.noField}</span>
          </div>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {MAIL_TEXT_PLACEHOLDERS.map((p) => (
              <li key={p} className="flex items-baseline gap-2 text-xs text-muted">
                <button
                  type="button"
                  // mousedown verhindern, damit das Textfeld seinen Fokus und die Cursorposition behält.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertPlaceholder(p)}
                  disabled={!focusedKey || (EMPHASIS_TEXT_KEYS as readonly string[]).includes(focusedKey)}
                  className="shrink-0 rounded-[2px] border border-line-alt px-1.5 py-0.5 font-mono text-text hover:border-red-bright disabled:opacity-50"
                >{`{{${p}}}`}</button>
                <span>{t.placeholders.explanations[p]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          {section === "draft" && (
            <>
              <p className="text-sm text-muted">{t.draftIntro}</p>
              {fieldList(DRAFT_FIELDS)}
            </>
          )}
          {section === "confirmation" && (
            <>
              <p className="text-sm text-muted">{t.confirmationIntro}</p>
              {fieldList(CONFIRMATION_FIELDS)}
            </>
          )}
          {section === "emphasis" && emphasisTable}

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
        </div>

        {/* Live-Vorschau: auf dem Desktop neben den Feldern (sticky), auf dem Handy darunter. */}
        <aside id="mailtext-preview" className="min-w-0 border border-line-alt bg-bg-alt lg:sticky lg:top-4">
          <div className="flex flex-col gap-3 border-b border-line-alt px-4 py-3">
            <h3 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-muted">{t.preview.title}</h3>
            <div role="group" aria-label={t.preview.scenarioLabel} className="flex flex-wrap gap-2">
              {PREVIEW_SCENARIO_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={scenario === id}
                  onClick={() => setScenario(id)}
                  className={[
                    "rounded-[2px] border px-2.5 py-1 text-xs",
                    scenario === id ? "border-red bg-red-soft text-text" : "border-line-alt text-muted hover:text-text",
                  ].join(" ")}
                >
                  {t.preview.scenarios[id]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-2.5 border border-line-alt bg-bg" />
                {t.preview.legendText}
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-2.5 border-l-2 border-line-alt bg-panel-alt" />
                {t.preview.legendGenerated}
              </span>
            </div>
          </div>
          <div className="flex max-h-[calc(100vh-14rem)] flex-col gap-3 overflow-y-auto px-4 py-4 text-sm leading-relaxed">
            <p className="text-xs text-muted">
              <span className="font-semibold uppercase tracking-[0.08em]">{t.preview.subjectLabel}:</span> {preview.subject}
            </p>
            {preview.paragraphs.map((p, i) => (
              <p
                key={i}
                className={[
                  "whitespace-pre-wrap break-words",
                  p.generated ? "border-l-2 border-line-alt bg-panel-alt px-3 py-2 text-muted" : "text-text",
                ].join(" ")}
              >
                {p.text}
              </p>
            ))}
            <p className="text-[11px] text-dim">{t.preview.note}</p>
          </div>
        </aside>
      </div>
    </form>
  );
}
