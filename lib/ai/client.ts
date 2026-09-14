// Anthropic-Client für Posten 3 (Schnellweg) und optional das Antwortentwurf-
// Polishing (lib/draft/polish.ts, ausserhalb dieser Aufgabe). Lazy erzeugt
// wie lib/mail/resend.ts: der Client (und die Prüfung des SDK, ob ein
// Api-Key vorliegt) entsteht erst beim ersten tatsächlichen Aufruf, nicht
// beim Import dieses Moduls, damit Tests und `npm run build` auch ohne
// ANTHROPIC_API_KEY laufen.
//
// Modell-IDs und Tool-Use-Konventionen aus dem Skill "claude-api" (siehe
// docs/architektur.md, Abschnitt "Posten 3, Schnellweg": "Vor dem Schreiben
// des Codes den Skill claude-api laden").
import Anthropic from "@anthropic-ai/sdk";

/**
 * Standardmodell für die Extraktion (Posten 3). CLAUDE.md/Aufgabenstellung
 * legen `claude-sonnet-5` als Standard fest (aktuelle Generation,
 * $2/$10 pro 1M Token, siehe Skill claude-api). Überschreibbar über
 * AI_MODEL, z. B. für einen Test mit einem anderen aktuellen Modell.
 */
export const DEFAULT_AI_MODEL = "claude-sonnet-5" as const;

export function getAiModel(): string {
  return process.env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
}

let client: Anthropic | null = null;

/**
 * Liefert den (lazy erzeugten) Anthropic-Client. Wirft erst hier, nicht
 * beim Import, wenn ANTHROPIC_API_KEY fehlt - Posten 3 ist gemäss
 * docs/architektur.md optional ("Optional Anthropic API für Posten 3").
 */
export function getAnthropicClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "getAnthropicClient: ANTHROPIC_API_KEY ist nicht gesetzt. Posten 3 (Schnellweg) ist ohne diesen Schlüssel nicht verfügbar.",
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

/** Nur für Tests: erzwingt, dass getAnthropicClient() den Client neu erzeugt. */
export function resetAnthropicClient(): void {
  client = null;
}
