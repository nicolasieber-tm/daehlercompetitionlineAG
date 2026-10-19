// Platzhalter {{schwerpunkt}} der Mailtexte (lib/mail/texts.ts): eine
// kurze, verkäuferische Umschreibung dessen, was der Kunde sich wünscht,
// aus den gewählten Bereichen und den Antworten auf die Folgefragen.
// Rückmeldung dÄHLer 19.10.2026: der Charaktersatz soll so konkret klingen
// wie in Christophs Beispielmail («Eine sportliche Klangkulisse in
// Kombination mit uneingeschränkter Alltagstauglichkeit entspricht genau
// unserem Anspruch.»), statt für jede Anfrage gleich.
//
// Die Wendungen stehen im Nominativ und klein (sie können mitten im Satz
// stehen); steht der Platzhalter am Satzanfang, schreibt capitalizeFirst()
// den ersten Buchstaben gross.
import type { Locale } from "@/lib/i18n/dictionaries";
import type { FlowCategory } from "@/lib/db/rows";

type Phrases = {
  motor: string;
  auspuff: Record<string, string> & { default: string };
  fahrwerk: Record<string, string> & { default: string };
  look: string;
  interieur: string;
  fallback: string;
  and: string;
};

const PHRASES: Record<Locale, Phrases> = {
  de: {
    motor: "spürbar mehr Leistung",
    auspuff: {
      dezent: "eine sonore, kultivierte Klangkulisse",
      kraeftig: "eine kräftige Klangkulisse",
      rennstrecke: "eine kompromisslose Klangkulisse",
      default: "eine sportliche Klangkulisse",
    },
    fahrwerk: {
      pass: "ein präzises Handling in Kurven",
      track: "ein rennstreckentaugliches Fahrwerk",
      default: "ein präzises Fahrverhalten",
    },
    look: "ein markanter Auftritt",
    interieur: "ein hochwertiges Interieur",
    fallback: "ein stimmiges Gesamtpaket",
    and: "und",
  },
  en: {
    motor: "noticeably more power",
    auspuff: {
      dezent: "a refined, sonorous sound",
      kraeftig: "a powerful sound",
      rennstrecke: "an uncompromising sound",
      default: "a sporty sound",
    },
    fahrwerk: {
      pass: "precise handling through corners",
      track: "a track-ready suspension",
      default: "precise handling",
    },
    look: "a distinctive look",
    interieur: "a high-quality interior",
    fallback: "a well-balanced overall package",
    and: "and",
  },
};

/** Höchstens drei Wendungen, sonst wird der Satz zur Aufzählung. */
const MAX_PHRASES = 3;

export function emphasisText(
  categories: readonly FlowCategory[],
  followUpAnswers: Partial<Record<string, string | null>> | null | undefined,
  locale: Locale,
): string {
  const p = PHRASES[locale] ?? PHRASES.de;
  const answers = followUpAnswers ?? {};
  const parts: string[] = [];
  if (categories.includes("motor")) parts.push(p.motor);
  if (categories.includes("auspuff")) parts.push(p.auspuff[answers.auspuff ?? ""] ?? p.auspuff.default);
  if (categories.includes("fahrwerk")) parts.push(p.fahrwerk[answers.fahrwerk ?? ""] ?? p.fahrwerk.default);
  if (categories.includes("raeder") || categories.includes("exterieur")) parts.push(p.look);
  if (categories.includes("interieur")) parts.push(p.interieur);
  const shown = parts.slice(0, MAX_PHRASES);
  if (shown.length === 0) return p.fallback;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(", ")} ${p.and} ${shown[shown.length - 1]}`;
}

/** Erster Buchstabe gross, für Sätze, die mit {{schwerpunkt}} beginnen. */
export function capitalizeFirst(text: string): string {
  const i = text.search(/\S/);
  if (i < 0) return text;
  return text.slice(0, i) + text.charAt(i).toLocaleUpperCase("de-CH") + text.slice(i + 1);
}
