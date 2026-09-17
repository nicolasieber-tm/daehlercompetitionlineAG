// Baut aus einer Extraction (lib/ai/extract.ts) einen InquiryPayload
// (lib/inquiry/schema.ts) und validiert ihn gegen QuickInquiryPayloadSchema
// (unten), eine vom Kundenflow-Schema (InquiryPayloadSchema, POST
// /api/inquiries) ABGELEITETE, für den Schnellweg gelockerte Variante -
// das ist der Sinn von docs/architektur.md "Posten 3, Schnellweg": "danach
// derselbe Weg wie eine Tool-Anfrage". Der so entstehende Payload geht
// direkt an lib/inquiry/create.ts createInquiry() (source "quick"),
// inklusive Produkte/Familie/Modell-Fitment-Prüfung, Prüfhinweisen,
// Antwortentwurf und Anfrage-Mail an info@ - siehe
// app/api/admin/quick/create/route.ts.
//
// Frühere Fassung dieser Datei baute auf lib/ai/adapter.ts (Übergangs-
// Adapter mit eigenem, lockerem Schema und einem Insert-Nachbau ohne
// Prüfhinweise/Antwortentwurf/Mail-Versand). lib/inquiry/create.ts und
// lib/inquiry/schema.ts existieren inzwischen (Prüfbericht Befund #1), der
// Adapter wurde entfernt.
//
// Prüfbericht Modul ai, Befund #1 (behoben): toInquiryPayload() validierte
// bis hierhin gegen EXAKT dasselbe InquiryPayloadSchema wie der
// Kundenflow, das Telefon UND E-Mail UND Ort zwingend verlangt (Formular-
// Pflichtfelder). Eine Telefonnotiz ohne E-Mail (einer der zwei in
// CLAUDE.md "Posten 3, Schnellweg" genannten Eingabetypen: "Freitext (Mail
// oder Telefonnotiz)") konnte damit NIE zu einer Anfrage werden - der
// Admin kann keine E-Mail-Adresse erfinden ("nichts erfinden", System-
// Prompt in lib/ai/extract.ts). QuickInquiryPayloadSchema unten verlangt
// stattdessen nur "Telefon ODER E-Mail" und lässt Ort offen; Charakter,
// Termin und Kanal bleiben Pflicht wie im Kundenflow (das sind bewusste
// Auswahlentscheidungen des Admins, keine vom Kunden diktierten Kontakt-
// daten, siehe QuickInquiryPayloadSchema unten).
import { z } from "zod";
import { getFamilyBySlug } from "@/lib/catalog/queries";
import { vehicleLineOptions } from "@/lib/catalog/vehicle-label";
import {
  InquiryPayloadObjectSchema,
  withInquiryPayloadRefinements,
  type InquiryPayload,
} from "@/lib/inquiry/schema";
import type { Character, Channel, FlowCategory, Locale, Timing } from "@/lib/db/rows";
import type { Extraction } from "./extract";

/**
 * Schnellweg-Variante von InquiryPayloadObjectSchema (lib/inquiry/schema.ts):
 * dieselben Regeln für alle Felder ausser phone/email/city (Befund #1 oben)
 * und character/timing (Prüfung Phase B, Punkt 7).
 *
 * Prüfung Phase B, Punkt 7: phone/email/city werden bei leerem String zu
 * `null` (statt wie zuvor `""`) - ein leerer String sah in Mails/Admin-
 * Anzeige wie ein tatsächlich befülltes, aber leeres Feld aus, `null` ist
 * das korrekte "nicht bekannt". character/timing sind zusätzlich `nullable`
 * (statt Pflicht-Enum): das Sprachmodell (lib/ai/extract.ts) liefert für
 * beide oft `null` (z. B. eine reine Telefonnotiz ohne erkennbaren
 * Zeitwunsch), der Admin trägt sie im UI nach, bevor die Anfrage angelegt
 * wird - bis dahin darf toInquiryPayload() nicht an einem fehlenden
 * character/timing scheitern (missing-Meldung statt harter Fehler).
 *
 * Die geparste Form weicht dadurch von InquiryPayload ab (city/phone/email:
 * `string | null` statt `string`, character/timing: `Character | null` /
 * `Timing | null` statt `Character`/`Timing`) - lib/inquiry/create.ts geht
 * mit beidem bereits robust um (dort bereits vorbereitete `as Character`/
 * `as Timing`-Zuweisungen; die DB-Spalten city/phone/email/character/timing
 * sind ebenfalls alle nullable, siehe docs/db.md). toInquiryPayload() macht
 * das am Ende über einen expliziten, dokumentierten Cast sichtbar (siehe
 * dort), statt `InquiryPayload` selbst aufzuweichen und damit die
 * Pflichtfelder des Kundenflow-Schemas (InquiryPayloadSchema, POST
 * /api/inquiries) zu lockern.
 */
const QuickInquiryPayloadSchema = withInquiryPayloadRefinements(
  InquiryPayloadObjectSchema.omit({ phone: true, email: true, city: true, character: true, timing: true }).extend({
    phone: z
      .string()
      .trim()
      .max(40)
      .optional()
      .default("")
      .transform((v) => (v.length > 0 ? v : null)),
    email: z
      .string()
      .trim()
      .max(120)
      .optional()
      .default("")
      .refine((v) => v === "" || z.string().email().safeParse(v).success, {
        message: "Bitte eine gültige E-Mail-Adresse angeben, wenn vorhanden.",
      })
      .transform((v) => (v.length > 0 ? v : null)),
    city: z
      .string()
      .trim()
      .max(80)
      .optional()
      .default("")
      .transform((v) => (v.length > 0 ? v : null)),
    character: InquiryPayloadObjectSchema.shape.character.nullable(),
    timing: InquiryPayloadObjectSchema.shape.timing.nullable(),
  }),
  // Weder Telefon noch E-Mail bekannt: der Admin kann keines von beiden
  // erfinden, aber ohne mindestens eine Kontaktmöglichkeit lässt sich die
  // Anfrage später nicht beantworten - dann `missing` melden statt eine
  // unkontaktierbare Anfrage anzulegen.
).refine((v) => !!v.phone || !!v.email, {
  message: "Bitte Telefon oder E-Mail angeben.",
  path: ["phone"],
});

/**
 * Vom Admin im UI nachgetragene/korrigierte Werte (app/admin/schnellweg/,
 * noch nicht Teil dieser Aufgabe). Fahrzeug weiterhin als Slug, wie die
 * Extraction und der Katalog fürs Sprachmodell (lib/catalog/queries.ts
 * getCatalogCompact(), CompactModel hat bewusst keine id) - die Auflösung
 * zu family_id/model_id passiert hier in toInquiryPayload(), nicht im UI.
 */
export interface QuickOverrides {
  locale?: Locale;
  familySlug?: string | null;
  modelSlug?: string | null;
  vehicleText?: string | null;
  year?: string | null;
  beenHere?: boolean;
  /** Kundenentscheid 17.09.2026: vom Admin gewählte Alternative bei
   * mehrdeutiger Baureihe (vehicleLineOptions()-id, z.B. "x2"), aus dem
   * Modell-Dropdown in QuickInquiryForm.tsx. Ohne Override versucht
   * toInquiryPayload() zuerst einen automatischen Abgleich über
   * extraction.vehicle.line (Label-Vergleich, siehe dort). */
  line?: string | null;
  categories?: FlowCategory[];
  consulting?: boolean;
  selections?: { productId: string }[];
  character?: Character | null;
  timing?: Timing | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  channel?: Channel | null;
  message?: string | null;
}

/** Aus Extraction + Overrides zusammengesetzter, noch ungeprüfter Stand (Formular-Sicht: alles nullable ausser den Booleans/Arrays). */
interface DraftFields {
  locale: Locale;
  familySlug: string | null;
  modelSlug: string | null;
  vehicleText: string | null;
  year: string | null;
  beenHere: boolean;
  /** Aufgelöste lineId (vehicleLineOptions()-id), siehe QuickOverrides.line. */
  line: string | null;
  categories: FlowCategory[];
  consulting: boolean;
  selections: { productId: string }[];
  character: Character | null;
  timing: Timing | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  channel: Channel | null;
  message: string | null;
}

function buildDraft(extraction: Extraction, overrides?: QuickOverrides): DraftFields {
  const fromExtraction: DraftFields = {
    locale: extraction.language,
    familySlug: extraction.vehicle.family_slug,
    modelSlug: extraction.vehicle.model_slug,
    vehicleText: extraction.vehicle.free_text || null,
    year: extraction.year,
    beenHere: false,
    // Wird unten in toInquiryPayload() aufgelöst (Label-Vergleich gegen
    // extraction.vehicle.line, siehe dort); die Extraction selbst kennt
    // keine lineId (nur den freien Modellnamen aus dem Text).
    line: null,
    categories: extraction.categories,
    consulting: extraction.consulting,
    selections: extraction.selections
      .filter((s) => s.product_id !== null)
      .map((s) => ({ productId: s.product_id as string })),
    character: extraction.character,
    timing: extraction.timing,
    firstName: extraction.contact.first_name,
    lastName: extraction.contact.last_name,
    city: extraction.contact.city,
    phone: extraction.contact.phone,
    email: extraction.contact.email,
    channel: extraction.contact.channel,
    message: extraction.message || null,
  };
  return { ...fromExtraction, ...overrides };
}

export interface ToInquiryPayloadResult {
  /** true, wenn payload gesetzt ist und direkt an createInquiry() (lib/inquiry/create.ts) übergeben werden kann. */
  ok: boolean;
  /** Nur gesetzt, wenn ok=true. */
  payload: InquiryPayload | null;
  /**
   * Ein Eintrag je zod-issue aus QuickInquiryPayloadSchema (Feldpfad, z. B.
   * "familyId", "phone", "categories"), damit der Admin sie im UI
   * ergänzt/korrigiert (docs/architektur.md: "Admin prüft, korrigiert
   * (Dropdowns)"). Leer, wenn ok=true.
   */
  missing: string[];
}

/**
 * Baut aus einer Extraction (+ optionalen Admin-Korrekturen) einen
 * InquiryPayload und validiert ihn gegen QuickInquiryPayloadSchema (oben),
 * die für den Schnellweg gelockerte Variante des Kundenflow-Schemas
 * (Befund #1). Eine Freitext-Extraktion liefert selten alle Pflichtfelder
 * (Charakter/Termin oft unbekannt, Ort selten genannt, oft nur Telefon ODER
 * E-Mail): in diesen Fällen ist ok=false, `missing` listet die Feldpfade,
 * der Admin ergänzt sie im UI, bevor toInquiryPayload() erneut mit
 * `overrides` aufgerufen wird - Telefon ODER E-Mail bleibt dabei die
 * einzige Pflicht bei den Kontaktdaten, nicht beide (siehe Befund #1 oben).
 *
 * Familie/Modell kommen aus der Extraction nur als Slug: eine nicht im
 * Katalog auflösbare Familie (unbekannter Slug, Tippfehler in einem
 * Override) ergibt familyId=null -> "familyId" in `missing`, statt wie
 * zuvor im Adapter (Prüfbericht Befund #2) eine Anfrage ganz ohne Fahrzeug
 * anzulegen.
 *
 * `privacyAccepted` existiert im Kundenflow-Schema nur wegen der
 * Datenschutz-Checkbox im Website-Formular; für eine von dÄHLer selbst aus
 * Mail/Telefonnotiz erfasste Anfrage gibt es keine entsprechende Checkbox
 * eines Kunden. Das Feld wird hier daher immer als erfüllt gesetzt (kein
 * simulierter Kundenkonsens, nur die interne Freigabe durch den Admin, der
 * die Anfrage ohnehin vor sich hat und aktiv "Anfrage anlegen" klickt).
 */
export async function toInquiryPayload(
  extraction: Extraction,
  overrides?: QuickOverrides,
): Promise<ToInquiryPayloadResult> {
  const draft = buildDraft(extraction, overrides);

  let familyId: string | null = null;
  let modelId: string | null = null;
  // Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
  // Motorisierungen, das Modell ist X1 oder X2"): ohne Admin-Override
  // (draft.line, siehe QuickOverrides.line) wird der vom Sprachmodell frei
  // erkannte Modellname (extraction.vehicle.line, z.B. "X2") per
  // Label-Vergleich einer Alternative zugeordnet - nur möglich, sobald
  // familyId/modelId feststehen (vehicleLineOptions() braucht Familie UND
  // Motorisierung).
  let lineId: string | null = draft.line;
  if (draft.familySlug) {
    const family = await getFamilyBySlug(draft.familySlug);
    familyId = family?.id ?? null;
    if (family && draft.modelSlug) {
      const model = family.models.find((m) => m.slug === draft.modelSlug);
      modelId = model?.id ?? null;
      if (model) {
        const options = vehicleLineOptions(
          { brand: family.brand, name: family.name, codes: family.codes },
          { name: model.name },
        );
        if (lineId) {
          // Admin-Override gegen die aktuellen Optionen prüfen, statt ihn
          // ungeprüft zu übernehmen (analog lib/inquiry/create.ts).
          if (!options.some((o) => o.id === lineId)) lineId = null;
        } else if (extraction.vehicle.line) {
          const norm = (value: string) => value.trim().toLowerCase();
          const match = options.find((o) => norm(o.label) === norm(extraction.vehicle.line as string));
          lineId = match?.id ?? null;
        }
      } else {
        lineId = null;
      }
    } else {
      lineId = null;
    }
  } else {
    lineId = null;
  }

  const candidate = {
    locale: draft.locale,
    familyId: familyId ?? "",
    modelId,
    vehicleText: draft.vehicleText,
    year: draft.year ?? "",
    beenHere: draft.beenHere,
    line: lineId,
    // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
    // der Schnellweg hat keinen Fahrzeug-Schritt mit Getriebe-Chips, die
    // Extraction liefert dafür keinen Wert - null (Frage nicht gestellt),
    // wie im Kurzablauf ohne Modell.
    gearbox: null,
    categories: draft.categories,
    consulting: draft.consulting,
    selections: draft.selections,
    followUpAnswers: {},
    character: draft.character,
    timing: draft.timing,
    firstName: draft.firstName ?? "",
    lastName: draft.lastName ?? "",
    city: draft.city ?? "",
    phone: draft.phone ?? "",
    email: draft.email ?? "",
    channel: draft.channel,
    message: draft.message ?? "",
    privacyAccepted: true as const,
  };

  const parsed = QuickInquiryPayloadSchema.safeParse(candidate);
  if (!parsed.success) {
    const missing = [...new Set(parsed.error.issues.map((issue) => (issue.path.length > 0 ? issue.path.join(".") : issue.message)))];
    return { ok: false, payload: null, missing };
  }

  // parsed.data ist NICHT mehr feldweise identisch zu InquiryPayload (siehe
  // QuickInquiryPayloadSchema-Kommentar oben: city/phone/email/character/
  // timing sind hier zusätzlich nullable). Der Cast macht das bewusst
  // sichtbar statt es zu verstecken: lib/inquiry/create.ts (source "quick",
  // ausserhalb der mir zugewiesenen Dateien) geht mit den nullable Feldern
  // bereits robust um (vorbereitete `as Character`/`as Timing`-Zuweisungen,
  // CheckContext/DraftContext akzeptieren beide als `X | null`, siehe
  // lib/rules/checks.ts/lib/draft/template.ts), die DB-Spalten sind
  // ebenfalls alle nullable (docs/db.md) - der Cast erlaubt TypeScript hier
  // nur, weil InquiryPayload (schmaler) strukturell in den weiteren Typ von
  // parsed.data passt, keine `unknown`-Umgehung.
  return { ok: true, payload: parsed.data as InquiryPayload, missing: [] };
}
