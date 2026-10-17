// Vom Kunden im Admin bearbeitbare Mailtexte (Einstellungen, «Mailtexte»).
// Rückmeldung dÄHLer 14.10.2026: Einleitung und Schluss der
// Bestätigungsmail und des Antwortentwurfs will Christoph Dähler selbst
// formulieren, ohne dass wir jedes Mal den Code anpassen. Gespeichert in
// settings (Key-Value), ein leeres Feld bedeutet «Standardtext». Die
// Standardtexte unten folgen seiner Beispielmail vom 14.10.2026.
//
// Struktur, Positionen, Preise, Vorher/Nachher und Richtsumme baut weiterhin
// das Tool, die Texte rahmen sie nur ein. Je Sprache eine eigene Fassung
// (Posten 4, Wunsch dÄHLer 17.10.2026): Deutsch unter dem Schlüssel selbst,
// Englisch unter «<Schlüssel>_en» (mailTextSettingKey()).
import type { Locale } from "@/lib/i18n/dictionaries";

export const MAIL_TEXT_KEYS = [
  "text_confirmation_intro",
  "text_confirmation_closing",
  "text_draft_intro",
  "text_draft_character_dezent",
  "text_draft_character_sportlich",
  "text_draft_character_maximum",
  "text_draft_items_intro",
  "text_draft_timing",
  "text_draft_closing",
] as const;

export type MailTextKey = (typeof MAIL_TEXT_KEYS)[number];

/** settings-Schlüssel eines Mailtexts je Sprache: Deutsch ohne, Englisch mit Suffix «_en». */
export function mailTextSettingKey(key: MailTextKey, locale: Locale): string {
  return locale === "de" ? key : `${key}_${locale}`;
}

/** Alle settings-Schlüssel der Mailtexte über alle Sprachen (für das Speichern im Admin). */
export const MAIL_TEXT_SETTING_KEYS: readonly string[] = (["de", "en"] as const).flatMap((locale) =>
  MAIL_TEXT_KEYS.map((key) => mailTextSettingKey(key, locale)),
);
export type MailTexts = Record<MailTextKey, string>;

/** Platzhalter in den Mailtexten, wie bei den Follow-up-Regeln mit doppelten Klammern. */
export const MAIL_TEXT_PLACEHOLDERS = ["vorname", "name", "fahrzeug", "jahrgang", "nummer"] as const;
export type MailTextPlaceholder = (typeof MAIL_TEXT_PLACEHOLDERS)[number];

export const DEFAULT_MAIL_TEXTS: Record<Locale, MailTexts> = {
  de: {
    text_confirmation_intro:
      "Guten Tag {{vorname}} {{name}}\n\n" +
      "Vielen Dank für Ihre Anfrage und Ihr Interesse an unseren dÄHLer Performance-Komponenten für Ihren {{fahrzeug}}. " +
      "Nachfolgend finden Sie die Übersicht Ihres Wunschpakets. Wir prüfen die gewünschte Kombination und melden uns innert einem Arbeitstag mit einem konkreten Angebot.",
    text_confirmation_closing:
      "Bei Fragen stehen wir Ihnen selbstverständlich gerne telefonisch oder per E-Mail zur Verfügung. " +
      "Wir freuen uns, Ihr Fahrzeug gemeinsam mit Ihnen sportlich und technisch sinnvoll weiterzuentwickeln.\n\n" +
      "Freundliche Grüsse\n\ndÄHLer Competition Line AG",
    text_draft_intro:
      "Guten Tag {{vorname}} {{name}}\n\n" +
      "Vielen Dank für Ihre Anfrage und Ihr Interesse an unseren dÄHLer Performance-Komponenten für Ihren {{fahrzeug}}{{jahrgang}}.",
    text_draft_character_dezent:
      "Spürbar mehr Fahrfreude bei einem dezenten Auftritt entspricht genau unserem Anspruch.",
    text_draft_character_sportlich:
      "Eine sportliche Abstimmung in Kombination mit uneingeschränkter Alltagstauglichkeit entspricht genau unserem Anspruch.",
    text_draft_character_maximum:
      "Das Maximum aus Ihrem Fahrzeug herauszuholen, technisch sauber und abgestimmt, entspricht genau unserem Anspruch.",
    text_draft_items_intro:
      "Gerne prüfen wir die passende Lösung für Ihr Fahrzeug und unterbreiten Ihnen dazu folgendes Angebot:",
    text_draft_timing:
      "Für die kommenden Wochen verfügen wir noch über mögliche Werkstatttermine. " +
      "Gerne reservieren wir Ihnen einen passenden Termin, sobald Sie uns Ihr Einverständnis geben und die gewünschte Ausführung feststeht.",
    text_draft_closing:
      "Bei Fragen oder zur weiteren Besprechung stehen wir Ihnen selbstverständlich gerne telefonisch oder per E-Mail zur Verfügung. " +
      "Wir freuen uns, Ihr Fahrzeug gemeinsam mit Ihnen sportlich und technisch sinnvoll weiterzuentwickeln.\n\n" +
      "Freundliche Grüsse",
  },
  en: {
    text_confirmation_intro:
      "Dear {{vorname}} {{name}}\n\n" +
      "Thank you for your enquiry and your interest in dÄHLer performance components for your {{fahrzeug}}. " +
      "Below you will find an overview of your package. We will check the combination and get back to you within one working day with a specific offer.",
    text_confirmation_closing:
      "If you have any questions, we are happy to help by phone or e-mail. " +
      "We look forward to developing your car together with you, sporty and technically sound.\n\n" +
      "Kind regards\n\ndÄHLer Competition Line AG",
    text_draft_intro:
      "Dear {{vorname}} {{name}}\n\n" +
      "Thank you for your enquiry and your interest in dÄHLer performance components for your {{fahrzeug}}{{jahrgang}}.",
    text_draft_character_dezent: "Noticeably more driving pleasure with a discreet appearance is exactly what we stand for.",
    text_draft_character_sportlich:
      "A sporty set-up combined with full everyday usability is exactly what we stand for.",
    text_draft_character_maximum:
      "Getting the maximum out of your car, technically clean and well matched, is exactly what we stand for.",
    text_draft_items_intro: "We will be glad to check the right solution for your car and are pleased to offer you the following:",
    text_draft_timing:
      "We still have workshop slots available in the coming weeks. " +
      "We will be happy to reserve a suitable date for you as soon as you give us the go-ahead and the desired configuration is settled.",
    text_draft_closing:
      "If you have any questions or would like to discuss the details, we are happy to help by phone or e-mail. " +
      "We look forward to developing your car together with you, sporty and technically sound.\n\n" +
      "Kind regards",
  },
};

/**
 * Wirksame Mailtexte einer Sprache: der Admin-Text aus settings, sofern
 * nicht leer, sonst der Standardtext dieser Sprache.
 */
export function resolveMailTexts(locale: Locale, settings: Partial<Record<string, string>> | null | undefined): MailTexts {
  const defaults = DEFAULT_MAIL_TEXTS[locale] ?? DEFAULT_MAIL_TEXTS.de;
  if (!settings) return defaults;
  const out = { ...defaults };
  for (const key of MAIL_TEXT_KEYS) {
    const value = settings[mailTextSettingKey(key, locale)];
    if (typeof value === "string" && value.trim() !== "") out[key] = value.replace(/\r\n/g, "\n").trim();
  }
  return out;
}

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Ersetzt die Platzhalter. Unbekannte Platzhalter (Tippfehler) werden
 * geleert, nie roh an den Kunden geschickt; doppelte Leerzeichen, die ein
 * leerer Wert hinterlässt, werden zusammengezogen.
 */
export function fillMailText(template: string, vars: Partial<Record<MailTextPlaceholder, string>>): string {
  return template
    .replace(PLACEHOLDER_PATTERN, (_match, key: string) => {
      const value = (vars as Record<string, string | undefined>)[key];
      return value ?? "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.])/g, "$1");
}

/** Unbekannte Platzhalter in einem Text, für die Prüfung beim Speichern im Admin. */
export function unknownMailTextPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    if (!(MAIL_TEXT_PLACEHOLDERS as readonly string[]).includes(match[1])) found.add(match[0]);
  }
  return [...found];
}
