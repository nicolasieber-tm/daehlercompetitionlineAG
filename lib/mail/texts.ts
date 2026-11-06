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
  "text_confirmation_lead",
  "text_confirmation_closing",
  "text_draft_intro",
  // Charaktersätze: seit 06.11.2026 nur noch in der Bestätigungsmail, der
  // Schlüssel bleibt wegen bereits gespeicherter Admin-Texte unverändert.
  "text_draft_character_dezent",
  "text_draft_character_sportlich",
  "text_draft_character_maximum",
  // Wunsch 02.11.2026: Satz, wenn kein Charakter gewählt ist (Schnellweg, Freitext ohne Hinweis).
  "text_draft_character_none",
  "text_draft_items_intro",
  "text_draft_question_fahrwerk",
  "text_draft_question_motor_auspuff",
  "text_draft_question_generic",
  "text_draft_timing",
  "text_draft_closing",
  // Wendungen für {{schwerpunkt}} (lib/mail/emphasis.ts), Wunsch dÄHLer
  // 19.10.2026: im Admin pflegbar. Klein beginnend, Nominativ.
  "text_emph_motor",
  "text_emph_auspuff_dezent",
  "text_emph_auspuff_kraeftig",
  "text_emph_auspuff_rennstrecke",
  "text_emph_auspuff_default",
  "text_emph_fahrwerk_pass",
  "text_emph_fahrwerk_track",
  "text_emph_fahrwerk_default",
  "text_emph_look",
  "text_emph_interieur",
  "text_emph_fallback",
] as const;

/** Die Schwerpunkt-Wendungen unter den Mailtexten (eigener Abschnitt im Admin). */
export const EMPHASIS_TEXT_KEYS = MAIL_TEXT_KEYS.filter((k) => k.startsWith("text_emph_"));

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
// {{schwerpunkt}}: aus Bereichen und Folgefragen zusammengesetzt, z.B.
// «spürbar mehr Leistung und eine kräftige Klangkulisse», siehe
// lib/mail/emphasis.ts (Rückmeldung dÄHLer 19.10.2026).
// {{anrede}} und {{modell}} (Rückmeldung dÄHLer 28.10.2026, Beispielmail):
// «Herr Dähler» bzw. «Vorname Name» ohne Anrede (lib/mail/anrede.ts) und das
// Fahrzeug ohne Baureihencode, «BMW M2» statt «BMW M2 (G87)».
export const MAIL_TEXT_PLACEHOLDERS = [
  "anrede",
  "vorname",
  "name",
  "fahrzeug",
  "modell",
  "jahrgang",
  "nummer",
  "schwerpunkt",
] as const;
export type MailTextPlaceholder = (typeof MAIL_TEXT_PLACEHOLDERS)[number];

// Rückmeldung dÄHLer 19.10.2026 («noch nicht attraktiv»): der Charaktersatz
// nach Christophs Beispielmail mit {{schwerpunkt}}, steht jetzt auch in der
// Bestätigungsmail (dort gefolgt von text_confirmation_lead statt der
// Angebots-Überleitung des Antwortentwurfs).
export const DEFAULT_MAIL_TEXTS: Record<Locale, MailTexts> = {
  de: {
    text_confirmation_intro:
      "Guten Tag {{anrede}}\n\n" +
      "Vielen Dank für Ihre Anfrage und Ihr Interesse an unseren dÄHLer Performance-Komponenten für Ihren {{fahrzeug}}.",
    text_confirmation_lead:
      "Gerne prüfen wir die passende Lösung für Ihr Fahrzeug. Nachfolgend finden Sie die Übersicht Ihres Wunschpakets, " +
      "innert einem Arbeitstag erhalten Sie von uns ein konkretes Angebot.",
    text_confirmation_closing:
      "Bei Fragen stehen wir Ihnen selbstverständlich gerne telefonisch oder per E-Mail zur Verfügung. " +
      "Wir freuen uns, Ihr Fahrzeug gemeinsam mit Ihnen sportlich und technisch sinnvoll weiterzuentwickeln.\n\n" +
      "Sportliche Grüsse aus Belp\n\ndÄHLer Competition Line AG",
    text_draft_intro:
      "Guten Tag {{anrede}}\n\n" +
      "Gerne kommen wir auf Ihre Anfrage Nr. {{nummer}} für Ihren {{fahrzeug}} zurück.",
    text_draft_character_dezent: "{{schwerpunkt}}, dezent und stilsicher umgesetzt, genau hier setzen wir bei dÄHLer an.",
    text_draft_character_sportlich:
      "{{schwerpunkt}}, sportlich und präzise abgestimmt, genau hier setzen wir bei dÄHLer an.",
    text_draft_character_maximum:
      "{{schwerpunkt}}, konsequent auf das Maximum ausgelegt und technisch sauber abgestimmt, genau hier setzen wir bei dÄHLer an.",
    text_draft_character_none: "{{schwerpunkt}}, technisch sauber umgesetzt, genau hier setzen wir bei dÄHLer an.",
    text_draft_items_intro: "Für Ihren {{modell}} bieten wir Ihnen Folgendes an:",
    text_draft_question_fahrwerk:
      "Damit wir Ihnen ein exakt auf Ihr Fahrzeug abgestimmtes Angebot erstellen können, bitten wir Sie noch um eine kurze Rückmeldung, " +
      "ob Ihr {{modell}} mit dem adaptiven M-Fahrwerk ausgestattet ist. Anschliessend können wir die Details prüfen und Ihnen den definitiven Preis bestätigen.",
    text_draft_question_motor_auspuff:
      "Damit wir Ihnen ein exakt auf Ihr Fahrzeug abgestimmtes Angebot erstellen können, prüfen wir die gewünschte Kombination aus " +
      "Software-Leistungssteigerung und Abgasanlage. Anschliessend bestätigen wir Ihnen gerne den definitiven Preis.",
    text_draft_question_generic:
      "Damit wir Ihnen ein exakt auf Ihr Fahrzeug abgestimmtes Angebot erstellen können, prüfen wir die gewünschte Ausführung. " +
      "Anschliessend bestätigen wir Ihnen gerne den definitiven Preis.",
    text_draft_timing:
      "Gerne übernehmen wir die fachgerechte Montage bei uns in Belp. Für die kommenden Wochen können wir Ihnen bereits passende Werkstatttermine anbieten " +
      "und reservieren Ihnen gerne einen Termin, sobald Sie sich für die Umsetzung entschieden haben.",
    text_draft_closing:
      "Wenn Sie die Ausführung im Detail mit uns besprechen möchten, freuen wir uns auf Ihren Anruf oder Ihre kurze Rückmeldung per E-Mail.\n\n" +
      "Wir würden uns freuen, Ihren {{modell}} gemeinsam mit Ihnen noch individueller zu gestalten.\n\n" +
      "Sportliche Grüsse aus Belp",
    text_emph_motor: "spürbar mehr Leistung",
    text_emph_auspuff_dezent: "eine sonore, kultivierte Klangkulisse",
    text_emph_auspuff_kraeftig: "eine kräftige Klangkulisse",
    text_emph_auspuff_rennstrecke: "eine kompromisslose Klangkulisse",
    text_emph_auspuff_default: "eine sportliche Klangkulisse",
    text_emph_fahrwerk_pass: "ein präzises Handling in Kurven",
    text_emph_fahrwerk_track: "ein rennstreckentaugliches Fahrwerk",
    text_emph_fahrwerk_default: "ein präzises Fahrverhalten",
    text_emph_look: "ein markanter Auftritt",
    text_emph_interieur: "ein hochwertiges Interieur",
    text_emph_fallback: "ein stimmiges Gesamtpaket",
  },
  en: {
    text_confirmation_intro:
      "Dear {{anrede}}\n\n" +
      "Thank you for your enquiry and your interest in dÄHLer performance components for your {{fahrzeug}}.",
    text_confirmation_lead:
      "We will be glad to check the right solution for your car. Below you will find an overview of your package, " +
      "within one working day you will receive a specific offer from us.",
    text_confirmation_closing:
      "If you have any questions, we are happy to help by phone or e-mail. " +
      "We look forward to developing your car together with you, sporty and technically sound.\n\n" +
      "Sporty greetings from Belp\n\ndÄHLer Competition Line AG",
    text_draft_intro:
      "Dear {{anrede}}\n\n" +
      "Following up on your enquiry no. {{nummer}} for your {{fahrzeug}}, we are pleased to send you our offer.",
    text_draft_character_dezent: "{{schwerpunkt}}, discreetly and stylishly executed, is exactly where we at dÄHLer come in.",
    text_draft_character_sportlich: "{{schwerpunkt}}, sporty and precisely set up, is exactly where we at dÄHLer come in.",
    text_draft_character_maximum:
      "{{schwerpunkt}}, consistently designed for the maximum and technically well matched, is exactly where we at dÄHLer come in.",
    text_draft_character_none: "{{schwerpunkt}}, technically well executed, is exactly where we at dÄHLer come in.",
    text_draft_items_intro: "For your {{modell}} we can offer you the following:",
    text_draft_question_fahrwerk:
      "So that we can prepare an offer that is precisely matched to your car, we would ask you for a brief reply on whether your {{modell}} " +
      "is equipped with the adaptive M suspension. We can then check the details and confirm the final price to you.",
    text_draft_question_motor_auspuff:
      "So that we can prepare an offer that is precisely matched to your car, we will check the desired combination of software power increase " +
      "and exhaust system. We will then be glad to confirm the final price to you.",
    text_draft_question_generic:
      "So that we can prepare an offer that is precisely matched to your car, we will check the desired configuration. " +
      "We will then be glad to confirm the final price to you.",
    text_draft_timing:
      "We would be happy to carry out the professional fitting at our workshop in Belp. We can already offer you suitable workshop dates for the coming weeks " +
      "and will be glad to reserve a date for you as soon as you have decided to go ahead.",
    text_draft_closing:
      "If you would like to discuss the details with us, we look forward to your call or a brief reply by e-mail.\n\n" +
      "We would be delighted to make your {{modell}} even more individual together with you.\n\n" +
      "Sporty greetings from Belp",
    text_emph_motor: "noticeably more power",
    text_emph_auspuff_dezent: "a refined, sonorous sound",
    text_emph_auspuff_kraeftig: "a powerful sound",
    text_emph_auspuff_rennstrecke: "an uncompromising sound",
    text_emph_auspuff_default: "a sporty sound",
    text_emph_fahrwerk_pass: "precise handling through corners",
    text_emph_fahrwerk_track: "a track-ready suspension",
    text_emph_fahrwerk_default: "precise handling",
    text_emph_look: "a distinctive look",
    text_emph_interieur: "a high-quality interior",
    text_emph_fallback: "a well-balanced overall package",
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
