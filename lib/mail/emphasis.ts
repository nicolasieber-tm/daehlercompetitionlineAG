// Platzhalter {{schwerpunkt}} der Mailtexte (lib/mail/texts.ts): eine
// kurze, verkäuferische Umschreibung dessen, was der Kunde sich wünscht,
// aus den gewählten Bereichen und den Antworten auf die Folgefragen.
// Rückmeldung dÄHLer 19.10.2026: der Charaktersatz soll so konkret klingen
// wie in Christophs Beispielmail («Eine sportliche Klangkulisse in
// Kombination mit uneingeschränkter Alltagstauglichkeit entspricht genau
// unserem Anspruch.»), statt für jede Anfrage gleich. Die Wendungen selbst
// pflegt der Kunde im Admin (text_emph_*), hier steht nur die Auswahl.
//
// Die Wendungen stehen im Nominativ und klein (sie können mitten im Satz
// stehen); steht der Platzhalter am Satzanfang, schreibt capitalizeFirst()
// den ersten Buchstaben gross.
import type { Locale } from "@/lib/i18n/dictionaries";
import type { FlowCategory } from "@/lib/db/rows";
import { DEFAULT_MAIL_TEXTS } from "./texts";
import type { MailTexts } from "./texts";

const AND: Record<Locale, string> = { de: "und", en: "and" };

/** Höchstens drei Wendungen, sonst wird der Satz zur Aufzählung. */
const MAX_PHRASES = 3;

export function emphasisText(
  categories: readonly FlowCategory[],
  followUpAnswers: Partial<Record<string, string | null>> | null | undefined,
  locale: Locale,
  texts: MailTexts = DEFAULT_MAIL_TEXTS[locale] ?? DEFAULT_MAIL_TEXTS.de,
): string {
  const answers = followUpAnswers ?? {};
  const auspuff: Record<string, string> = {
    dezent: texts.text_emph_auspuff_dezent,
    kraeftig: texts.text_emph_auspuff_kraeftig,
    rennstrecke: texts.text_emph_auspuff_rennstrecke,
  };
  const fahrwerk: Record<string, string> = {
    pass: texts.text_emph_fahrwerk_pass,
    track: texts.text_emph_fahrwerk_track,
  };
  const parts: string[] = [];
  if (categories.includes("motor")) parts.push(texts.text_emph_motor);
  if (categories.includes("auspuff")) parts.push(auspuff[answers.auspuff ?? ""] ?? texts.text_emph_auspuff_default);
  if (categories.includes("fahrwerk")) parts.push(fahrwerk[answers.fahrwerk ?? ""] ?? texts.text_emph_fahrwerk_default);
  if (categories.includes("raeder") || categories.includes("exterieur")) parts.push(texts.text_emph_look);
  if (categories.includes("interieur")) parts.push(texts.text_emph_interieur);
  // Platzhalter in einer Wendung würden nicht mehr ersetzt (die Wendung
  // ist selbst der Wert von {{schwerpunkt}}), deshalb entfernen.
  const clean = (p: string) => p.replace(/\{\{\w+\}\}/g, "").replace(/\s{2,}/g, " ").trim();
  const shown = parts.map(clean).filter(Boolean).slice(0, MAX_PHRASES);
  if (shown.length === 0) return clean(texts.text_emph_fallback);
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} ${AND[locale] ?? AND.de} ${shown[shown.length - 1]}`;
}

/** Erster Buchstabe gross, für Sätze, die mit {{schwerpunkt}} beginnen. */
export function capitalizeFirst(text: string): string {
  const i = text.search(/\S/);
  if (i < 0) return text;
  return text.slice(0, i) + text.charAt(i).toLocaleUpperCase("de-CH") + text.slice(i + 1);
}
