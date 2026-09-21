// Automatische Übersetzung der Excel-Produkttexte per Claude (Tool Use,
// strict), siehe lib/ai/extract.ts (Posten 3) für dieselben Konventionen.
// Modell-IDs/Tool-Use gemäss Skill "claude-api". Nur der Aufruf und die
// Nachprüfung liegen hier; welche Texte fehlen und wie sie gespeichert
// werden, entscheidet lib/translations/sync.ts.
//
// Nachprüfung (validateTranslation): eine Übersetzung, die Zahlen verliert
// oder verändert (Reifendimensionen, PS/Nm, mm, Preise) oder den Markennamen
// dÄHLer fallen lässt, wird verworfen und der Text bleibt "fehlend" (der
// Flow zeigt dann den deutschen Text) - lieber deutsch als falsch.
import type Anthropic from "@anthropic-ai/sdk";
import { getAiModel, getAnthropicClient } from "@/lib/ai/client";
import type { Locale } from "@/lib/i18n/dictionaries";
import { glossaryPromptBlock } from "./glossary";

const TARGET_LANGUAGE: Record<Exclude<Locale, "de">, string> = {
  en: "britisches Englisch",
};

function systemPrompt(locale: Exclude<Locale, "de">): string {
  return [
    `Sie übersetzen Produktbezeichnungen aus der Preisliste von dÄHLer Competition Line AG (Belp, Schweiz; Veredler für BMW, MINI, Toyota und Wiesmann) vom Deutschen in ${TARGET_LANGUAGE[locale]}.`,
    "Die Texte erscheinen als Kacheltitel, Positionszeilen und Hinweise in einem Anfragetool für Endkunden. Übersetzen Sie knapp und fachlich korrekt, wie ein Tuning-Katalog es schreiben würde, ohne Erklärungen oder Zusätze.",
    "Regeln, unbedingt einhalten:",
    "- Jede Zahl, Einheit und Masse bleibt exakt erhalten (z.B. 275/30 20, 620PS / 740Nm, -20mm, 8 HP, CHF 450). Keine Zahl darf fehlen, hinzukommen oder umgerechnet werden.",
    "- Zeilenumbrüche im Ausgangstext bleiben an derselben Stelle erhalten (gleiche Anzahl Zeilen).",
    "- Grossschreibung und Satzzeichen wie im Original (ein abschliessender Doppelpunkt bleibt ein Doppelpunkt).",
    "- Marken-, Produkt- und Codebezeichnungen unverändert lassen (siehe Liste).",
    "- Kein Gedankenstrich (weder – noch —), stattdessen Komma oder Bindestrich wie im Original.",
    "- Genau eine Übersetzung je id, alle ids ausfüllen, per Werkzeugaufruf record_translations.",
    "",
    glossaryPromptBlock(),
  ].join("\n");
}

const RECORD_TRANSLATIONS_TOOL: Anthropic.Tool = {
  name: "record_translations",
  description: "Erfasst die Übersetzung jedes Ausgangstexts, genau ein Eintrag je id.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["translations"],
    properties: {
      translations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "text"],
          properties: {
            id: { type: "integer", description: "Die id des Ausgangstexts." },
            text: { type: "string", description: "Die Übersetzung, Zeilenumbrüche als \\n." },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Nachprüfung
// ---------------------------------------------------------------------------

const NUMBER_PATTERN = /\d+/g;

function numberTokens(text: string): string[] {
  return text.match(NUMBER_PATTERN) ?? [];
}

/**
 * Prüft eine einzelne Übersetzung gegen ihren Quelltext. null = in Ordnung,
 * sonst der Grund (für Log/Admin). Zahlen werden als Multimenge verglichen:
 * jede Ziffernfolge des Quelltexts muss in der Übersetzung mindestens so
 * oft vorkommen ("1'240" und "1,240" tragen dieselben Ziffernfolgen 1 und
 * 240, ein Tausendertrennzeichen darf die Übersetzung also anpassen, nicht
 * aber die Zahl selbst).
 */
export function validateTranslation(source: string, translated: string): string | null {
  const t = translated.trim();
  if (!t) return "leer";
  if (t.length > source.length * 3 + 40) return "unverhältnismässig lang";
  if (/[–—]/.test(t)) return "enthält einen Gedankenstrich";

  const sourceLines = source.split("\n").length;
  const translatedLines = t.split("\n").length;
  if (sourceLines !== translatedLines) return `Zeilenanzahl ${translatedLines} statt ${sourceLines}`;

  const need = new Map<string, number>();
  for (const n of numberTokens(source)) need.set(n, (need.get(n) ?? 0) + 1);
  const have = new Map<string, number>();
  for (const n of numberTokens(t)) have.set(n, (have.get(n) ?? 0) + 1);
  for (const [n, count] of need) {
    if ((have.get(n) ?? 0) < count) return `Zahl ${n} fehlt`;
  }

  if (source.includes("dÄHLer") && !t.includes("dÄHLer")) return "Markenname dÄHLer fehlt";
  return null;
}

// ---------------------------------------------------------------------------
// Aufruf
// ---------------------------------------------------------------------------

export interface TranslateBatchResult {
  /** Quelltext -> geprüfte Übersetzung. */
  translations: Map<string, string>;
  /** Quelltext -> Grund, warum die gelieferte Übersetzung verworfen wurde (oder fehlte). */
  rejected: Map<string, string>;
  model: string;
}

/**
 * Übersetzt eine Liste von Quelltexten in EINEM Modellaufruf. Wirft bei
 * API-/Formatfehlern (der Aufrufer, lib/translations/sync.ts, fängt das je
 * Batch ab und zählt es als Fehler, statt den ganzen Lauf abzubrechen).
 */
export async function translateBatch(sourceTexts: readonly string[], locale: Exclude<Locale, "de">): Promise<TranslateBatchResult> {
  const model = getAiModel();
  const client = getAnthropicClient();

  const payload = sourceTexts.map((text, id) => ({ id, de: text }));
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: systemPrompt(locale),
    tools: [RECORD_TRANSLATIONS_TOOL],
    tool_choice: { type: "tool", name: "record_translations" },
    messages: [
      {
        role: "user",
        content: `Ausgangstexte als JSON (id, de):\n${JSON.stringify(payload, null, 0)}`,
      },
    ],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === RECORD_TRANSLATIONS_TOOL.name,
  );
  if (!toolUse) throw new Error("translateBatch: keine record_translations-Antwort erhalten.");

  return parseToolResult(toolUse.input, sourceTexts, model);
}

/** Aus der Tool-Antwort die geprüften Übersetzungen ziehen (getrennt, damit tests/translations sie ohne API prüfen können). */
export function parseToolResult(input: unknown, sourceTexts: readonly string[], model: string): TranslateBatchResult {
  const translations = new Map<string, string>();
  const rejected = new Map<string, string>();
  const byId = new Map<number, string>();

  const list = (input as { translations?: unknown })?.translations;
  if (Array.isArray(list)) {
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as { id?: unknown; text?: unknown };
      if (typeof e.id === "number" && typeof e.text === "string" && !byId.has(e.id)) byId.set(e.id, e.text);
    }
  }

  sourceTexts.forEach((source, id) => {
    const raw = byId.get(id);
    if (raw === undefined) {
      rejected.set(source, "keine Übersetzung geliefert");
      return;
    }
    const translated = raw
      .replace(/ /g, " ")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .join("\n")
      .trim();
    const problem = validateTranslation(source, translated);
    if (problem) rejected.set(source, problem);
    else translations.set(source, translated);
  });

  return { translations, rejected, model };
}
