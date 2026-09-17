// zod-Schema für den Payload aus POST /api/inquiries (Kundenflow, siehe
// docs/architektur.md, Abschnitt "Kundenflow" und "Anfrage anlegen").
// Preise, Beträge und alles Serverseitig-Berechnete (number, checks, draft,
// estimated_total, share_token) sind hier bewusst NICHT Teil des Payloads:
// die kommen ausschliesslich aus lib/inquiry/create.ts, nie vom Client
// (siehe CLAUDE.md, Abschnitt "Arbeitsweise": "Preise nie von Hand ...").
import { z } from "zod";

const CHARACTER_VALUES = ["dezent", "sportlich", "maximum"] as const;
const TIMING_VALUES = ["asap", "m1_2", "m3_6", "flexible"] as const;
const CHANNEL_VALUES = ["phone", "email", "whatsapp"] as const;
const LOCALE_VALUES = ["de", "en"] as const;
// Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
// Antwort auf die Getriebefrage im Fahrzeug-Schritt. Muss wörtlich mit
// InquiryGearbox in lib/db/rows.ts übereinstimmen.
const GEARBOX_VALUES = ["manual", "automatic", "unknown"] as const;
// Muss wörtlich mit FLOW_CATEGORIES in lib/db/rows.ts übereinstimmen.
// Nicht von dort importiert (readonly FlowCategory[], keine literale Tupel-
// Form): z.enum() braucht ein literales Tupel, um die einzelnen Werte als
// Literal-Union (statt breitem string) zu typisieren - ein Cast auf
// [string, ...string[]] würde genau diese Literal-Typisierung verlieren
// (payload.categories wäre dann string[] statt FlowCategory[]).
const FLOW_CATEGORY_VALUES = ["motor", "auspuff", "fahrwerk", "raeder", "exterieur", "interieur"] as const;

const flowCategorySchema = z.enum(FLOW_CATEGORY_VALUES);

const selectionSchema = z.object({
  productId: z.string().uuid({ message: "selections[].productId muss eine gültige UUID sein." }),
});

/**
 * followUpAnswers: Record<Kategorie, Options-ID> (z.B. { motor: "beides" }),
 * siehe lib/i18n de.ts steps.category.followUp. Bewusst z.record(string,
 * string) statt z.record(flowCategorySchema, ...): ein zod-record über eine
 * enum-Schlüsselmenge verlangt in zod v4 ALLE Enum-Schlüssel (exhaustiv),
 * hier ist aber immer nur ein Teil befüllt (nur die tatsächlich gewählten
 * Kategorien haben eine Folgefrage, z.B. nie "exterieur" oder "interieur",
 * siehe lib/i18n de.ts: dort hat steps.category.followUp nur vier
 * Kategorien). lib/rules/checks.ts und lib/inquiry/summary.ts lesen ohnehin
 * nur per Schlüssel nach, ein unbekannter oder fehlender Schlüssel ist dort
 * unproblematisch (schlicht kein Treffer).
 */
const followUpAnswersSchema = z.record(z.string(), z.string());

/**
 * Objekt-Teil des Kundenflow-Payloads, VOR den beiden `.refine()`
 * Cross-Field-Regeln unten (die auf einem ZodEffects landen, das keine
 * `.omit()`/`.extend()` mehr erlaubt). Separat exportiert, damit der
 * Schnellweg (lib/ai/to-payload.ts QuickInquiryPayloadSchema, Prüfbericht
 * Modul ai Befund #1) mit `.omit()`/`.extend()` eine eigene Variante mit
 * gelockerten Kontaktfeldern (phone/email/city) bauen kann, ohne die
 * übrigen ~15 Feld-Regeln (UUIDs, Baujahr, Name, Charakter, Termin, Kanal
 * usw.) zu duplizieren. Das Kundenflow-Schema `InquiryPayloadSchema`
 * selbst bleibt unverändert (identisch zusammengesetzt wie zuvor).
 */
export const InquiryPayloadObjectSchema = z.object({
  locale: z.enum(LOCALE_VALUES),
  familyId: z.string().uuid({ message: "familyId muss eine gültige UUID sein." }),
  modelId: z.string().uuid({ message: "modelId muss eine gültige UUID sein." }).nullable(),
  // Freitext-Fahrzeugbezeichnung, wenn kein Modell zuordenbar ist (siehe
  // inquiries.vehicle_text in docs/architektur.md); leerer String zählt
  // wie null (kein Fahrzeugtext).
  vehicleText: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  year: z.string().trim().min(1, "Bitte Baujahr angeben.").max(20),
  beenHere: z.boolean(),
  // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
  // null, wenn die Getriebefrage nicht gestellt wurde (Modell ohne
  // getriebespezifische Produkte, oder Kurzablauf ohne Modell) - dann ist
  // sie auch kein Pflichtfeld (siehe FlowNav canNext in components/flow/
  // Flow.tsx, das die Frage nur bei hasGearboxSpecificProducts erzwingt).
  gearbox: z.enum(GEARBOX_VALUES).nullable(),
  // Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
  // Motorisierungen, das Modell ist X1 oder X2"): gewählte Alternative bei
  // mehrdeutiger Baureihe (lib/catalog/vehicle-label.ts
  // vehicleLineOptions()-id, z.B. "x2"), null wenn die Frage nicht gestellt
  // wurde. lib/inquiry/create.ts prüft sie erneut gegen die aktuellen
  // Optionen (könnten sich seit dem Laden des Flows geändert haben) und
  // speichert bei einem ungültigen Wert null statt eines manipulierten
  // Strings.
  line: z.string().trim().max(40).nullable().optional().transform((v) => (v && v.length > 0 ? v : null)),
  // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
  // die im Fahrzeug-Schritt effektiv wirksame Serienleistung (models.
  // series_ps, sonst die Chip-Auswahl bei mehreren series_ps_suggested-
  // Werten, siehe components/flow/state.ts effectiveSeriesPs()) - wird nach
  // dem Absenden für die Vorher/Nachher-Leistungszeile auf Abschluss-Screen,
  // Teilen-Seite und Bestätigungs-/Zusammenfassungsmail gebraucht
  // (inquiries.series_ps, siehe db/migrations/0001_init.sql). Optional
  // (Schnellweg/ältere Aufrufer ohne Chip-UI liefern das Feld gar nicht) - dann null, wie ohne
  // gewählte Serienleistung.
  seriesPs: z.number().int().min(1).max(2000).nullable().optional().transform((v) => v ?? null),
  categories: z.array(flowCategorySchema).max(FLOW_CATEGORY_VALUES.length),
  consulting: z.boolean(),
  selections: z.array(selectionSchema).max(200),
  followUpAnswers: followUpAnswersSchema.optional().default({}),
  character: z.enum(CHARACTER_VALUES),
  timing: z.enum(TIMING_VALUES),
  // Maximallängen (Prüfung Phase B, Punkt 5): ohne Obergrenze könnte ein
  // manipulierter Request (der Client-Flow selbst begrenzt die Felder nicht)
  // beliebig lange Werte in Mails, Antwortentwurf und DB-Spalten schreiben.
  firstName: z.string().trim().min(1, "Vorname ist ein Pflichtfeld.").max(80),
  lastName: z.string().trim().min(1, "Name ist ein Pflichtfeld.").max(80),
  // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 2):
  // Ort ist kein Pflichtfeld mehr (die Vorschau, docs/vorschau.html
  // viewContact()/canNext(), verlangt ihn nie) - leerer String zählt wie
  // kein Ort (analog vehicleText oben), Zusammenfassungen/Admin lassen ihn
  // dann weg statt eines leeren Feldes (lib/inquiry/summary.ts,
  // lib/mail/templates/inbox.ts, components/admin/CustomerCard.tsx/
  // InquiriesTable.tsx filtern bereits konsequent über Boolean(city)).
  city: z
    .string()
    .trim()
    .max(80)
    .optional()
    .default("")
    .transform((v) => (v.length > 0 ? v : null)),
  // Telefon ist ebenfalls kein generelles Pflichtfeld mehr (dieselbe
  // Rückmeldung, Punkt 2) - bei Kanal "phone"/"whatsapp" bleibt es Pflicht,
  // siehe die Cross-Field-Regel auf InquiryPayloadSchema unten (NICHT auf
  // withInquiryPayloadRefinements(), die auch der Schnellweg nutzt, siehe
  // lib/ai/to-payload.ts QuickInquiryPayloadSchema: dort bleibt "Telefon
  // ODER E-Mail" die einzige Pflicht, unabhängig vom Kanal).
  phone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .default("")
    .transform((v) => (v.length > 0 ? v : null)),
  email: z.string().trim().max(120).email({ message: "Bitte eine gültige E-Mail-Adresse angeben." }),
  channel: z.enum(CHANNEL_VALUES),
  message: z.string().max(2000).optional().default(""),
  privacyAccepted: z.literal(true, {
    message: "Die Datenschutzbestimmungen müssen akzeptiert werden.",
  }),
});

/**
 * Die zwei Cross-Field-Regeln, gemeinsam für Kundenflow- und
 * Schnellweg-Payload (siehe QuickInquiryPayloadSchema): mindestens eine
 * Kategorie/Komplettpaket, Produktauswahl nur mit Modell. Als Funktion
 * exportiert statt zweimal hingeschrieben, damit beide Schemas exakt
 * dieselbe Fehlermeldung/denselben Feldpfad liefern.
 */
export function withInquiryPayloadRefinements<
  Shape extends {
    categories: unknown[];
    consulting: boolean;
    modelId: string | null;
    selections: { productId: unknown }[];
  },
>(schema: z.ZodType<Shape>) {
  return schema
    // Wie im Kundenflow (errors.selectAtLeastOne, siehe lib/i18n de.ts/en.ts):
    // mindestens eine Kategorie oder das Komplettpaket muss gewählt sein.
    .refine((v) => v.categories.length > 0 || v.consulting, {
      message: "Bitte mindestens eine Kategorie oder das Komplettpaket wählen.",
      path: ["categories"],
    })
    // Kurzablauf (kein Modell, siehe CLAUDE.md "Modelle ohne Preisliste"):
    // ohne Modell gibt es keinen Produkt-Schritt, eine Produktauswahl ist
    // dann unmöglich zuzuordnen (Familie und Fitment lassen sich nicht
    // prüfen, siehe lib/inquiry/create.ts).
    .refine((v) => v.modelId !== null || v.selections.length === 0, {
      message: "Ohne Modell ist keine Produktauswahl möglich.",
      path: ["selections"],
    });
}

// Nur auf InquiryPayloadSchema (Kundenflow), NICHT auf
// withInquiryPayloadRefinements() selbst, damit QuickInquiryPayloadSchema
// (lib/ai/to-payload.ts) davon unberührt bleibt (dort bleibt "Telefon ODER
// E-Mail" die einzige Kontakt-Pflicht, unabhängig vom Kanal, siehe Befund
// #1 dort). Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE",
// Punkt 2): dieselben Pflichtfelder wie viewContact()/canNext() in
// docs/vorschau.html (Vorname, Name, E-Mail) - Telefon zusätzlich nur bei
// Kanal "phone"/"whatsapp" (Validierungstext siehe lib/i18n de.ts/en.ts
// errors.phoneRequiredForChannel, hier bewusst fest Deutsch wie die
// übrigen Feld-Meldungen oben).
export const InquiryPayloadSchema = withInquiryPayloadRefinements(InquiryPayloadObjectSchema).refine(
  (v) => !(v.channel === "phone" || v.channel === "whatsapp") || (v.phone != null && v.phone.length > 0),
  {
    message: "Telefon ist bei Kontakt per Telefon oder WhatsApp ein Pflichtfeld.",
    path: ["phone"],
  },
);

export type InquiryPayload = z.infer<typeof InquiryPayloadSchema>;
