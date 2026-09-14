// Optionales sprachliches Glätten des deterministischen Antwortentwurfs
// (lib/draft/template.ts). Siehe CLAUDE.md Abschnitt "Architektur"
// ("Optional Anthropic API für Posten 3") und docs/architektur.md Abschnitt
// "Antwortentwurf": "wenn ANTHROPIC_API_KEY gesetzt, wird die Vorlage
// sprachlich geglättet, Fakten (Preise, Positionen, Leistungen) dürfen sich
// nicht ändern; Ergebnis wird gegen die Vorlage geprüft (alle Preise und
// Positionsnamen müssen vorkommen), sonst Vorlage behalten."
//
// Standardmässig AUS (Aufgabenstellung: "Standard aus, in .env.example
// dokumentieren", siehe DRAFT_POLISH dort): lib/inquiry/create.ts läuft bei
// jeder eingehenden Kundenanfrage, ein zusätzlicher API-Aufruf pro Anfrage
// soll nicht unbeabsichtigt laufen/kosten, bevor der Kunde (dÄHLer) das
// bewusst aktiviert hat.
import Anthropic from "@anthropic-ai/sdk";
import type { Locale } from "@/lib/i18n/dictionaries";

// claude-sonnet-5, siehe Aufgabenstellung ("Modell claude-sonnet-5"), Skill
// claude-api geladen (Modell-ID gegengeprüft: aktuelles Modell, kein
// veraltetes Datums-Suffix).
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 2000;

const SYSTEM_PROMPT: Record<Locale, string> = {
  de: [
    "Du glättest sprachlich den Antwortentwurf einer Schweizer Auto-Tuning-Firma (dÄHLer Competition Line AG) an einen Kunden.",
    "Erhalte Sinn, Reihenfolge und Absatzstruktur. Ändere NIE Fakten: CHF-Preise, PS/Nm-Zahlen, Positionsnamen, die Anfragenummer, Termine, Namen.",
    "Sie-Form gegenüber dem Kunden, durchgehend «wir». Schweizer Schreibweise (ss statt ß). Keine Gedankenstriche.",
    "Ton: sachlich, technisch präzise, herzlich.",
    "Gib ausschliesslich den geglätteten Text zurück, ohne Anführungszeichen, ohne Erklärung, ohne Markdown.",
  ].join(" "),
  en: [
    "You lightly polish the wording of a reply draft from a Swiss car tuning company (dÄHLer Competition Line AG) to a customer.",
    "Preserve meaning, order and paragraph structure. NEVER change facts: CHF prices, PS/Nm figures, item names, the request number, dates, names.",
    "Formal, polite address to the customer, consistently \"we\". British English spelling. No em dashes or en dashes.",
    "Tone: precise, technical, warm.",
    "Return only the polished text, no quotation marks, no explanation, no markdown.",
  ].join(" "),
};

let client: Anthropic | null = null;

function getClient(apiKey: string): Anthropic {
  if (!client) client = new Anthropic({ apiKey });
  return client;
}

/** Nur für Tests: erzwingt beim nächsten Aufruf einen neuen Client. */
export function resetPolishClient(): void {
  client = null;
}

// Preise "CHF 4'180" (siehe lib/i18n/format.ts chf()), PS/Nm-Zahlen wie
// "620 PS" / "740 Nm", auch zusammengeschrieben wie in rohen Excel-
// Produktnamen ("620PS/740Nm", siehe docs/excel-import.md) - die Nachprüfung
// ist bewusst grosszügig (matcht beide Schreibweisen einzeln), damit ein
// geglätteter Text mit einem eingefügten Leerzeichen nicht fälschlich
// durchfällt.
const PRICE_PATTERN = /CHF\s*-?\d[\d']*/g;
const NUMBER_UNIT_PATTERN = /\d[\d']*\s*(?:PS|Nm)\b/gi;

function extractFacts(body: string): string[] {
  return [...(body.match(PRICE_PATTERN) ?? []), ...(body.match(NUMBER_UNIT_PATTERN) ?? [])];
}

/**
 * Positionsnamen aus den "• Kategorie: Name (Beschreibung), ab CHF x"-Zeilen
 * (siehe lib/draft/template.ts / lib/mail/render.ts itemLineText und
 * draft.itemLine in lib/i18n/de.ts): der reine Name zwischen "Kategorie: "
 * und der optionalen Klammer-Beschreibung bzw. dem Preis-/Status-Suffix.
 */
function extractItemNames(body: string): string[] {
  const names: string[] = [];
  for (const rawLine of body.split("\n")) {
    const match = /^•\s*[^:]+:\s*(.+)$/.exec(rawLine.trim());
    if (!match) continue;
    const name = match[1]
      .replace(/\s*\([^)]*\)\s*$/, "") // itemDescription " (...)"
      .replace(/,\s*[^,]*$/, "") // itemPrice/itemPriceInPreparation/itemPriceOnRequest ", ..."
      .trim();
    if (name) names.push(name);
  }
  return names;
}

function containsAll(text: string, facts: readonly string[]): boolean {
  return facts.every((fact) => text.includes(fact));
}

/**
 * Glättet body sprachlich per Claude, sofern ANTHROPIC_API_KEY gesetzt UND
 * DRAFT_POLISH=1 (siehe .env.example). Jeder Fehler- oder Zweifelsfall
 * (kein Key, Flag aus, API-Fehler, leere Antwort, fehlende Fakten im
 * Ergebnis) liefert unverändert body zurück - der Antwortentwurf darf durch
 * das optionale Glätten nie kaputtgehen, gekürzt werden oder verschwinden.
 */
export async function polishDraft(body: string, locale: Locale): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || process.env.DRAFT_POLISH !== "1") return body;
  if (!body.trim()) return body;

  const facts = extractFacts(body);
  const itemNames = extractItemNames(body);

  try {
    const response = await getClient(apiKey).messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT[locale] ?? SYSTEM_PROMPT.de,
      messages: [{ role: "user", content: body }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const polished = textBlock?.text.trim();
    if (!polished) return body;

    if (!containsAll(polished, facts) || !containsAll(polished, itemNames)) {
      console.warn("polishDraft: Nachprüfung fehlgeschlagen (fehlende Fakten), verwende unveränderten Entwurf.");
      return body;
    }

    return polished;
  } catch (err) {
    console.error("polishDraft: Anfrage an Claude fehlgeschlagen, verwende unveränderten Entwurf.", err);
    return body;
  }
}
