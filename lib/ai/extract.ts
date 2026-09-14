// Posten 3, Schnellweg: Freitext (Mail/Telefonnotiz) -> strukturierte
// Anfrage per Claude Tool Use. Siehe docs/architektur.md, Abschnitt
// "Posten 3, Schnellweg", und CLAUDE.md, Abschnitt "Posten 3, Schnellweg".
//
// Modell-IDs, Tool-Use, Structured Output und "strict"-Tools gemäss Skill
// "claude-api" (vor dem Schreiben dieser Datei geladen).
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getAnthropicClient, getAiModel } from "./client";
import { getCatalogCompact, type CompactFamily } from "@/lib/catalog/queries";
import { FLOW_CATEGORIES, type FlowCategory } from "@/lib/supabase/rows";

// ---------------------------------------------------------------------------
// Rollen-/Stil-Systemprompt. Zwei kurze Stilbeispiele aus docs/vorschau.html
// (Funktion draft()), von Du- auf Sie-Form umgestellt (CLAUDE.md: "Die
// Vorschau ist per Du, das wird umgestellt"), zusammen unter 300 Wörtern.
// Dient hier nur der Tonalitäts-/Kontexteinordnung für die Extraktion
// (message-Feld, Interpretation von Fachbegriffen), nicht der Erzeugung
// eines Antwortentwurfs (das macht lib/draft/template.ts, ausserhalb dieser
// Aufgabe).
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Sie sind der interne Erfassungs-Assistent von dÄHLer Competition Line AG (Belp, Schweiz), Veredler für BMW, MINI, Toyota und Wiesmann (Motor, Auspuff, Fahrwerk, Räder, Exterieur, Interieur). Ihre Aufgabe: eine an dÄHLer gerichtete Kundenanfrage (E-Mail oder Telefonnotiz) per Werkzeugaufruf "record_inquiry" strukturiert erfassen. Ein Mitarbeiter von dÄHLer prüft und korrigiert das Ergebnis danach immer, bevor daraus eine Anfrage wird.

Regeln, unbedingt einhalten:
- Nur Angaben verwenden, die im Text belegbar sind. Nichts erfinden, nichts ergänzen, auch keine naheliegenden Annahmen ("vermutlich Stufe 1" ist keine Angabe aus dem Text).
- family_slug und model_slug ausschliesslich aus der mitgelieferten Katalogliste übernehmen (exakte Schreibweise), sonst null.
- product_id ausschliesslich aus der mitgelieferten Produktliste übernehmen (exakte ID-Zeichenkette), nie selbst bilden oder raten.
- Sind Sie sich bei einer Zuordnung nicht sicher, setzen Sie eine niedrige confidence (unter 0.7) statt zu raten. Ist eine Zuordnung gar nicht möglich, lassen Sie das Feld null und vermerken es in open_questions.
- categories nur setzen, wenn im Text tatsächlich eine dieser Wunsch-Kategorien vorkommt: motor, auspuff, fahrwerk, raeder, exterieur, interieur.
- consulting=true nur, wenn der Kunde erkennbar ein Komplettpaket bzw. eine Beratung ohne konkrete Produktwahl wünscht.
- language: die tatsächliche Sprache des Ausgangstexts (de oder en), unabhängig von der Sprache dieser Anweisung.
- message: eine kurze, sachliche Zusammenfassung des Kundenanliegens in eigenen Worten, keine Erfindungen.

Tonalität von dÄHLer zur Einordnung (Sie-Form, sachlich, technisch präzise, herzlich), zwei kurze Beispiele aus einem Antwortentwurf:

"Danke für Ihre Anfrage für Ihren M2 G87 (Jahrgang 2024). Sportlich und alltagstauglich, das ist genau unsere Linie. Grundsätzlich können wir das so umsetzen: Motor Stufe 1, ab CHF 4'180."

"Richtpreis für das Paket: ab CHF 4'180, inklusive Einbau, ohne MFK. Den definitiven Preis bestätigen wir Ihnen, sobald wir die Details geprüft haben."`;

const PICK_FAMILY_SYSTEM_PROMPT = `Sie sind der interne Erfassungs-Assistent von dÄHLer Competition Line AG. Ordnen Sie den Ausgangstext ausschliesslich anhand der mitgelieferten Familienliste (Slug, Marke, Name, Modelle) der wahrscheinlichsten Fahrzeug-Familie zu, per Werkzeugaufruf "pick_family". Nur Angaben verwenden, die im Text belegbar sind; ist keine sichere Zuordnung möglich, family_slug=null und eine niedrige confidence.`;

// ---------------------------------------------------------------------------
// Tool-Schemas (strict: true, siehe Skill claude-api "Strict tool use")
// ---------------------------------------------------------------------------

/**
 * Nullable String-Feld als striktes JSON-Schema. `type: ["string","null"]`
 * (JSON-Schema-Array-Form) wird vom strict-tool-use-Validator der
 * Anthropic-API nicht akzeptiert (getestet: 400 "Enum value ... does not
 * match declared type"), die anyOf-Form dagegen schon.
 */
function nullableString(description?: string, enumValues?: string[]): Record<string, unknown> {
  return {
    anyOf: [
      { type: "string", ...(enumValues ? { enum: enumValues } : {}) },
      { type: "null" },
    ],
    ...(description ? { description } : {}),
  };
}

const RECORD_INQUIRY_TOOL: Anthropic.Tool = {
  name: "record_inquiry",
  description:
    "Erfasst eine aus Freitext extrahierte dÄHLer-Kundenanfrage strukturiert. Nur im Text belegbare Angaben, nichts erfinden.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "vehicle",
      "year",
      "categories",
      "selections",
      "consulting",
      "character",
      "timing",
      "contact",
      "message",
      "open_questions",
      "language",
    ],
    properties: {
      vehicle: {
        type: "object",
        additionalProperties: false,
        required: ["family_slug", "model_slug", "free_text", "confidence"],
        properties: {
          family_slug: nullableString("Slug aus der Familienliste, exakte Schreibweise, sonst null."),
          model_slug: nullableString("Slug aus der Modellliste der gewählten Familie, exakte Schreibweise, sonst null."),
          free_text: {
            type: "string",
            description: "Fahrzeugbezeichnung wörtlich/sinngemäss aus dem Text, auch wenn eine Zuordnung gefunden wurde.",
          },
          confidence: { type: "number", description: "0 bis 1." },
        },
      },
      year: nullableString("Baujahr/Jahrgang wörtlich aus dem Text, sonst null."),
      categories: {
        type: "array",
        items: { type: "string", enum: [...FLOW_CATEGORIES] },
      },
      selections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["product_id", "name_as_written", "confidence"],
          properties: {
            product_id: nullableString("Exakte ID aus der Produktliste, sonst null."),
            name_as_written: { type: "string", description: "Wie das Produkt im Ausgangstext benannt wurde." },
            confidence: { type: "number", description: "0 bis 1." },
          },
        },
      },
      consulting: {
        type: "boolean",
        description: "true, wenn der Kunde ein Komplettpaket/eine Beratung ohne konkrete Produktwahl wünscht.",
      },
      character: nullableString(undefined, ["dezent", "sportlich", "maximum"]),
      timing: nullableString(undefined, ["asap", "m1_2", "m3_6", "flexible"]),
      contact: {
        type: "object",
        additionalProperties: false,
        required: ["first_name", "last_name", "city", "phone", "email", "channel"],
        properties: {
          first_name: nullableString(),
          last_name: nullableString(),
          city: nullableString(),
          phone: nullableString(),
          email: nullableString(),
          channel: nullableString(undefined, ["phone", "email", "whatsapp"]),
        },
      },
      message: { type: "string", description: "Kurze sachliche Zusammenfassung des Anliegens, leerer String wenn nichts Zusätzliches." },
      open_questions: { type: "array", items: { type: "string" } },
      language: { type: "string", enum: ["de", "en"] },
    },
  },
};

const PICK_FAMILY_TOOL: Anthropic.Tool = {
  name: "pick_family",
  description: "Wählt die wahrscheinlichste Fahrzeug-Familie aus der Liste, um den Produktkatalog für den nächsten Schritt einzugrenzen.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["family_slug", "confidence"],
    properties: {
      family_slug: nullableString(),
      confidence: { type: "number", description: "0 bis 1." },
    },
  },
};

// ---------------------------------------------------------------------------
// Zod-Schema (spiegelt das Tool-JSON-Schema, für Runtime-Validierung)
// ---------------------------------------------------------------------------

const flowCategoryEnum = z.enum(FLOW_CATEGORIES as [FlowCategory, ...FlowCategory[]]);

const vehicleSchema = z.object({
  family_slug: z.string().min(1).nullable(),
  model_slug: z.string().min(1).nullable(),
  free_text: z.string(),
  confidence: z.number().min(0).max(1),
});

const selectionSchema = z.object({
  product_id: z.string().min(1).nullable(),
  name_as_written: z.string(),
  confidence: z.number().min(0).max(1),
});

const contactSchema = z.object({
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  channel: z.enum(["phone", "email", "whatsapp"]).nullable(),
});

export const extractionSchema = z.object({
  vehicle: vehicleSchema,
  year: z.string().nullable(),
  categories: z.array(flowCategoryEnum),
  selections: z.array(selectionSchema),
  consulting: z.boolean(),
  character: z.enum(["dezent", "sportlich", "maximum"]).nullable(),
  timing: z.enum(["asap", "m1_2", "m3_6", "flexible"]).nullable(),
  contact: contactSchema,
  message: z.string(),
  open_questions: z.array(z.string()),
  language: z.enum(["de", "en"]),
});

export type ExtractionData = z.infer<typeof extractionSchema>;

/** Extraction = validiertes Tool-Ergebnis + uncertain (alle Felder mit confidence < 0.7). */
export type Extraction = ExtractionData & { uncertain: string[] };

// ---------------------------------------------------------------------------
// Katalog-Kompaktierung fürs Sprachmodell
// ---------------------------------------------------------------------------

/**
 * Token-Budget für den kompletten Katalog (Familien + alle Produkte) in
 * einem einzigen Aufruf. Darüber: zweistufig (erst Familie eingrenzen,
 * dann nur deren Produkte mitschicken), siehe docs/architektur.md
 * "Posten 3, Schnellweg" bzw. die Aufgabenstellung dieser Datei.
 */
export const MAX_CATALOG_TOKENS = 60000;

function familyIndexText(catalog: CompactFamily[]): string {
  return catalog
    .map((f) => {
      const models = f.models.map((m) => `${m.slug}=${m.name}`).join(", ") || "-";
      return `${f.slug}\t${f.brand}\t${f.name}\tModelle: ${models}`;
    })
    .join("\n");
}

function productsText(catalog: CompactFamily[], onlyFamilySlug?: string | null): string {
  const families = onlyFamilySlug ? catalog.filter((f) => f.slug === onlyFamilySlug) : catalog;
  return families
    .map((f) => {
      const lines = f.products.map((p) => `${p.id}\t${p.category}\t${p.name}\t${p.priceTotal ?? "-"}`).join("\n");
      return `### ${f.slug}\n${lines || "(keine aktiven Produkte)"}`;
    })
    .join("\n\n");
}

function buildUserMessage(catalogText: string, rawText: string, locale?: "de" | "en"): string {
  return [
    'KATALOG (Familien mit Modell-Slugs, danach je Familie die Produkte als "ID<TAB>Kategorie<TAB>Name<TAB>Richtpreis CHF oder -"):',
    catalogText,
    "",
    locale ? `Vom Aufrufer vermutete Sprache: ${locale}.` : "",
    "AUSGANGSTEXT (Mail oder Telefonnotiz):",
    rawText,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// ---------------------------------------------------------------------------
// Anthropic-Aufrufe
// ---------------------------------------------------------------------------

async function countRequestTokens(
  client: Anthropic,
  args: { system: string; message: string; tools: Anthropic.Tool[] },
): Promise<number> {
  const result = await client.messages.countTokens({
    model: getAiModel(),
    system: args.system,
    tools: args.tools,
    messages: [{ role: "user", content: args.message }],
  });
  return result.input_tokens;
}

interface CallUsage {
  inputTokens: number;
  outputTokens: number;
}

function toCallUsage(usage: Anthropic.Usage): CallUsage {
  return { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens };
}

async function callRecordInquiry(
  client: Anthropic,
  userMessage: string,
): Promise<{ input: unknown; usage: CallUsage }> {
  const response = await client.messages.create({
    model: getAiModel(),
    max_tokens: 4096,
    // Extraktion ist reine Klassifikation/Zuordnung gegen eine mitgelieferte
    // Liste, kein offenes Problem: niedriger Effort spart Zeit/Kosten, siehe
    // Skill claude-api ("chat, classification ... often don't [profit from
    // higher effort] and do well at low").
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    tools: [RECORD_INQUIRY_TOOL],
    tool_choice: { type: "tool", name: "record_inquiry" },
    messages: [{ role: "user", content: userMessage }],
  });

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.type === "refusal" ? response.stop_details.category : null;
    throw new Error(`extractInquiry(): Anfrage vom Modell abgelehnt (Kategorie: ${category ?? "unbekannt"}).`);
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "record_inquiry",
  );
  if (!toolUse) {
    throw new Error(
      `extractInquiry(): Modell hat "record_inquiry" nicht aufgerufen (stop_reason=${response.stop_reason}).`,
    );
  }

  return { input: toolUse.input, usage: toCallUsage(response.usage) };
}

async function callPickFamily(
  client: Anthropic,
  userMessage: string,
): Promise<{ familySlug: string | null; confidence: number; usage: CallUsage }> {
  const response = await client.messages.create({
    model: getAiModel(),
    max_tokens: 512,
    thinking: { type: "adaptive" },
    output_config: { effort: "low" },
    system: PICK_FAMILY_SYSTEM_PROMPT,
    tools: [PICK_FAMILY_TOOL],
    tool_choice: { type: "tool", name: "pick_family" },
    messages: [{ role: "user", content: userMessage }],
  });

  const usage = toCallUsage(response.usage);
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "pick_family",
  );
  if (!toolUse) return { familySlug: null, confidence: 0, usage };

  const parsed = z.object({ family_slug: z.string().nullable(), confidence: z.number() }).safeParse(toolUse.input);
  if (!parsed.success) return { familySlug: null, confidence: 0, usage };
  return { familySlug: parsed.data.family_slug, confidence: parsed.data.confidence, usage };
}

// ---------------------------------------------------------------------------
// Validierung: Produkt-IDs und Familie-/Modell-Slugs müssen im Katalog
// existieren, sonst auf null setzen und in open_questions vermerken (siehe
// Aufgabenstellung). uncertain: alle Felder mit confidence < 0.7.
// ---------------------------------------------------------------------------

const CHARACTER_VALUES = ["dezent", "sportlich", "maximum"] as const;
const TIMING_VALUES = ["asap", "m1_2", "m3_6", "flexible"] as const;
const CHANNEL_VALUES = ["phone", "email", "whatsapp"] as const;

function sanitizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  notes: string[],
  fieldLabel: string,
): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  notes.push(`Feld "${fieldLabel}" hatte einen unzulässigen Wert ("${String(value)}"), wurde auf null gesetzt.`);
  return null;
}

/**
 * Best-effort-Bereinigung des rohen Tool-Ergebnisses, BEVOR es gegen
 * extractionSchema geprüft wird. Das JSON-Schema des Tools erzwingt zwar
 * strikt die Objektstruktur (additionalProperties: false, required), aber
 * nicht zuverlässig die enum-Werte innerhalb verschachtelter anyOf-Zweige
 * (character/timing/contact.channel) bzw. Array-Items (categories):
 * beobachtet im Live-Test (tests/ai/live.test.ts), das Modell lieferte dort
 * einen character-Wert ausserhalb der drei zulässigen Optionen, trotz
 * strict:true. Ungültige Werte werden hier auf null (bzw. "de" bei
 * language, da nicht nullable) gesetzt statt die ganze Extraktion mit
 * einer ZodError abzubrechen, und als open_questions-Hinweis vermerkt -
 * konsistent mit dem Umgang mit ungültigen Produkt-IDs/Slugs weiter unten.
 */
function sanitizeRawExtraction(raw: unknown): { data: Record<string, unknown>; notes: string[] } {
  const notes: string[] = [];
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const contact = (obj.contact && typeof obj.contact === "object" ? obj.contact : {}) as Record<string, unknown>;

  const rawCategories = Array.isArray(obj.categories) ? obj.categories : [];
  const validCategories = new Set<string>(FLOW_CATEGORIES);
  const categories = rawCategories.filter((c): c is string => typeof c === "string" && validCategories.has(c));
  if (categories.length !== rawCategories.length) {
    notes.push('Feld "categories" enthielt einen unbekannten Wert, dieser wurde entfernt.');
  }

  const character = sanitizeEnum(obj.character, CHARACTER_VALUES, notes, "character");
  const timing = sanitizeEnum(obj.timing, TIMING_VALUES, notes, "timing");
  const channel = sanitizeEnum(contact.channel, CHANNEL_VALUES, notes, "contact.channel");

  let language = obj.language;
  if (language !== "de" && language !== "en") {
    notes.push(`Feld "language" hatte einen unzulässigen Wert ("${String(language)}"), wurde auf "de" gesetzt.`);
    language = "de";
  }

  return {
    data: { ...obj, categories, character, timing, contact: { ...contact, channel }, language },
    notes,
  };
}

function validateExtraction(raw: unknown, catalog: CompactFamily[]): Extraction {
  const { data: sanitized, notes: sanitizeNotes } = sanitizeRawExtraction(raw);
  const parsed = extractionSchema.parse(sanitized);
  parsed.open_questions = [...sanitizeNotes, ...parsed.open_questions];

  const familySlugs = new Set(catalog.map((f) => f.slug));
  const modelSlugsByFamily = new Map(catalog.map((f) => [f.slug, new Set(f.models.map((m) => m.slug))]));

  const openQuestions = [...parsed.open_questions];

  let familySlug = parsed.vehicle.family_slug;
  if (familySlug && !familySlugs.has(familySlug)) {
    openQuestions.push(`Fahrzeug-Familie "${familySlug}" nicht im Katalog gefunden, bitte manuell zuordnen.`);
    familySlug = null;
  }

  let modelSlug = parsed.vehicle.model_slug;
  if (modelSlug) {
    const validModels = familySlug ? modelSlugsByFamily.get(familySlug) : undefined;
    if (!validModels || !validModels.has(modelSlug)) {
      openQuestions.push(`Modell "${modelSlug}" nicht in der Modellliste der Familie gefunden, bitte manuell zuordnen.`);
      modelSlug = null;
    }
  }

  // Produkt-IDs NUR gegen die erkannte Familie prüfen, nicht gegen den
  // gesamten Katalog (Befund #2 im Prüfbericht: ein Produkt-ID-Set über
  // alle Familien liess Produkte fremder Familien durch, z. B. ein
  // Fahrwerksprodukt der 3er-Reihe bei einem erkannten M2 G87 - beides
  // landete dann in derselben Anfrage samt Richtsumme). Ohne erkannte
  // Familie ist keine Zuordnung belegbar, also gilt dann jede product_id
  // als nicht auflösbar.
  const familyProductIds = new Set(familySlug ? (catalog.find((f) => f.slug === familySlug)?.products ?? []).map((p) => p.id) : []);

  const selections = parsed.selections.map((s) => {
    if (s.product_id && !familyProductIds.has(s.product_id)) {
      const reason = familySlug
        ? `passt nicht zur erkannten Fahrzeug-Familie "${familySlug}"`
        : "keine Fahrzeug-Familie erkannt, Zuordnung nicht möglich";
      openQuestions.push(
        `Produkt-ID "${s.product_id}" (geschrieben als "${s.name_as_written}") ${reason}, bitte manuell zuordnen.`,
      );
      return { ...s, product_id: null };
    }
    return s;
  });

  const uncertain: string[] = [];
  if (parsed.vehicle.confidence < 0.7) uncertain.push("vehicle");
  selections.forEach((s, i) => {
    if (s.confidence < 0.7) uncertain.push(`selections[${i}]`);
  });

  return {
    ...parsed,
    vehicle: { ...parsed.vehicle, family_slug: familySlug, model_slug: modelSlug },
    selections,
    open_questions: openQuestions,
    uncertain,
  };
}

// ---------------------------------------------------------------------------
// extractInquiry
// ---------------------------------------------------------------------------

/**
 * Optionaler, bereits erzeugter Supabase-Client für getCatalogCompact()
 * (lib/catalog/queries.ts), analog zu dessen eigenem `db?`-Parameter:
 * ohne Next.js-Request-Kontext (z. B. aus vitest/tsx heraus, siehe
 * tests/ai/live.test.ts) wirft lib/supabase/server.ts (next/headers
 * cookies() ausserhalb eines Requests), daher hier durchreichbar, z. B.
 * mit lib/supabase/admin.ts createAdminClient(). Innerhalb einer
 * Route-Handler-Anfrage (app/api/admin/quick/extract/route.ts) kann das
 * Argument entfallen, dann verwendet getCatalogCompact() den
 * RLS-gebundenen Server-Client der laufenden Admin-Session.
 */
type CatalogDb = Parameters<typeof getCatalogCompact>[0];

/**
 * Extrahiert eine strukturierte Anfrage aus Freitext (Mail/Telefonnotiz).
 * Lädt den Katalog kompakt (lib/catalog/queries.ts getCatalogCompact()),
 * zählt dessen Token (client.messages.countTokens, "Tokens zählen und im
 * Bericht nennen") und schickt ihn entweder komplett mit
 * (< MAX_CATALOG_TOKENS) oder grenzt vorher per separatem, günstigem
 * Aufruf (Tool "pick_family") auf eine Familie ein.
 */
export async function extractInquiry(rawText: string, locale?: "de" | "en", db?: CatalogDb): Promise<Extraction> {
  if (!rawText.trim()) {
    throw new Error("extractInquiry(): rawText ist leer.");
  }

  const client = getAnthropicClient();
  const catalog = await getCatalogCompact(db);

  const familyIndex = familyIndexText(catalog);
  const fullCatalogText = `${familyIndex}\n\n${productsText(catalog)}`;
  let userMessage = buildUserMessage(fullCatalogText, rawText, locale);

  const usage: CallUsage[] = [];
  let catalogTokens = await countRequestTokens(client, {
    system: SYSTEM_PROMPT,
    message: userMessage,
    tools: [RECORD_INQUIRY_TOOL],
  });

  let narrowedToFamily: string | null = null;
  // Befund #3 im Prüfbericht: wenn pick_family keine Familie liefert
  // (mehrdeutig oder gar keine erkennbar), fiel productsText(catalog, null)
  // auf den KOMPLETTEN Katalog zurück - genau im unklaren Fall wurde also
  // wieder der volle Katalog (~165k Tokens, ca. 0.35 USD/11s) geschickt und
  // das Budget war wirkungslos. Ohne sichere Familie ist eine Produkt-
  // zuordnung ohnehin nicht belegbar (siehe SYSTEM_PROMPT-Regel dazu), also
  // wird dann nur der (kleine) Familienindex ohne Produkte geschickt: das
  // Modell kann in diesem Fall keine product_id liefern (nicht in der
  // Liste), was korrekt ist.
  let productsOmittedForBudget = false;

  if (catalogTokens > MAX_CATALOG_TOKENS) {
    const pickMessage = buildUserMessage(familyIndex, rawText, locale);
    const pick = await callPickFamily(client, pickMessage);
    usage.push(pick.usage);

    narrowedToFamily = pick.familySlug && catalog.some((f) => f.slug === pick.familySlug) ? pick.familySlug : null;
    productsOmittedForBudget = narrowedToFamily === null;

    const narrowedCatalogText = narrowedToFamily
      ? `${familyIndex}\n\n${productsText(catalog, narrowedToFamily)}`
      : familyIndex;
    userMessage = buildUserMessage(narrowedCatalogText, rawText, locale);
    catalogTokens = await countRequestTokens(client, {
      system: SYSTEM_PROMPT,
      message: userMessage,
      tools: [RECORD_INQUIRY_TOOL],
    });
  }

  const { input, usage: recordUsage } = await callRecordInquiry(client, userMessage);
  usage.push(recordUsage);

  const extraction = validateExtraction(input, catalog);
  if (productsOmittedForBudget) {
    extraction.open_questions.push(
      "Fahrzeug-Familie nicht sicher erkannt (Katalog zu gross für einen einzelnen Aufruf): " +
        "Produktliste wurde nicht mitgeschickt, Produktauswahl bitte manuell prüfen.",
    );
  }

  const totalInput = usage.reduce((sum, u) => sum + u.inputTokens, 0);
  const totalOutput = usage.reduce((sum, u) => sum + u.outputTokens, 0);
  console.info(
    `[extractInquiry] model=${getAiModel()} catalogTokens=${catalogTokens} narrowedToFamily=${narrowedToFamily ?? "-"} ` +
      `calls=${usage.length} inputTokens=${totalInput} outputTokens=${totalOutput}`,
  );

  return extraction;
}
