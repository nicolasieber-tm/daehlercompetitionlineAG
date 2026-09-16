// Row-Typen und Enums für das Schema aus db/migrations/0001_init.sql,
// handgepflegt (siehe docs/umbau-railway.md, Abschnitt
// "Datenzugriffsschicht").
//
// Zeitspalten (created_at, updated_at, sent_at, ...) sind `string`, echte
// ISO-8601-Strings (UTC, z.B. "2026-09-16T12:34:56.123Z"): lib/db/client.ts
// wandelt Postgres' timestamp/timestamptz-Rohtext beim Lesen über
// `new Date(value).toISOString()` um (siehe dortiger Kommentar). `date`-
// Spalten (aktuell nur follow_ups.scheduled_for) bleiben bewusst als reiner
// "YYYY-MM-DD"-Text ohne Zeitanteil.
//
// FlowCategory muss mit lib/pricelist/types.ts kompatibel bleiben
// (dort: FlowCategory = 'motor'|'auspuff'|'fahrwerk'|'raeder'|'exterieur'|'interieur').

/** Für jsonb-Spalten (payload, diff, summary, selections, ...). */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// --- Katalog -----------------------------------------------------------

export interface ModelFamily {
  id: string;
  brand: string;
  name: string;
  slug: string;
  codes: string[];
  pricelist_no: string | null;
  source_file: string | null;
  has_pricelist: boolean;
  photo_url: string | null;
  short_text: string | null;
  sort: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ModelFamilyInsert = Partial<ModelFamily> &
  Pick<ModelFamily, "brand" | "name" | "slug">;
export type ModelFamilyUpdate = Partial<ModelFamily>;

export interface Model {
  id: string;
  family_id: string;
  name: string;
  slug: string;
  fuel: string | null;
  series_ps: number | null;
  series_nm: number | null;
  series_ps_suggested: number[];
  photo_url: string | null;
  sort: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ModelInsert = Partial<Model> &
  Pick<Model, "family_id" | "name" | "slug">;
export type ModelUpdate = Partial<Model>;

export interface Product {
  id: string;
  family_id: string;
  category: string;
  source_category: string | null;
  group_label: string | null;
  name: string;
  description: string | null;
  article_no: string | null;
  rc: string | null;
  price_parts: number | null;
  price_install: number | null;
  price_approval: number | null;
  price_total: number | null;
  price_status: string;
  price_note: string | null;
  ps_base: number[];
  ps_to: number | null;
  nm_to: number | null;
  variant_group: string | null;
  fits_all: boolean;
  sort: number;
  source_row: number | null;
  content_hash: string | null;
  active: boolean;
  gearbox: string | null;
  created_at: string;
  updated_at: string;
}

export type ProductInsert = Partial<Product> &
  Pick<Product, "family_id" | "category" | "name">;
export type ProductUpdate = Partial<Product>;

export interface ProductFitment {
  product_id: string;
  model_id: string;
  created_at: string;
}

export type ProductFitmentInsert = Partial<ProductFitment> &
  Pick<ProductFitment, "product_id" | "model_id">;
export type ProductFitmentUpdate = Partial<ProductFitment>;

export interface PricelistNote {
  id: string;
  family_id: string;
  category: string | null;
  text: string;
  sort: number;
  created_at: string;
  updated_at: string;
}

export type PricelistNoteInsert = Partial<PricelistNote> &
  Pick<PricelistNote, "family_id" | "text">;
export type PricelistNoteUpdate = Partial<PricelistNote>;

export interface PricelistImport {
  id: string;
  filenames: string[];
  status: string;
  diff: Json;
  summary: Json;
  /** Vom Parser gelieferte Rohdaten (ParsedFamily[]), Import-Zwischenspeicher.
   * Wird nach Übernehmen/Verwerfen auf null gesetzt (siehe
   * lib/pricelist/imports.ts). */
  payload: Json;
  applied_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PricelistImportInsert = Partial<PricelistImport>;
export type PricelistImportUpdate = Partial<PricelistImport>;

// --- Anfragen ------------------------------------------------------------

export interface Inquiry {
  id: string;
  number: string;
  status: string;
  source: string;
  locale: string;
  family_id: string | null;
  model_id: string | null;
  vehicle_text: string | null;
  year: string | null;
  been_here: boolean;
  categories: string[];
  consulting: boolean;
  selections: Json;
  follow_up_answers: Json;
  character: string | null;
  timing: string | null;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  channel: string | null;
  message: string | null;
  estimated_total: number | null;
  checks: Json;
  draft_subject: string | null;
  draft_reply: string | null;
  share_token: string;
  raw_text: string | null;
  ai_extraction: Json;
  gearbox: string | null;
  series_ps: number | null;
  replied_at: string | null;
  answer_received_at: string | null;
  created_at: string;
  updated_at: string;
}

export type InquiryInsert = Partial<Inquiry> &
  Pick<Inquiry, "number" | "share_token">;
export type InquiryUpdate = Partial<Inquiry>;

export interface OutboundEmail {
  id: string;
  inquiry_id: string;
  type: string;
  to_email: string;
  subject: string | null;
  body_text: string | null;
  resend_id: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OutboundEmailInsert = Partial<OutboundEmail> &
  Pick<OutboundEmail, "inquiry_id" | "type" | "to_email">;
export type OutboundEmailUpdate = Partial<OutboundEmail>;

export interface FollowUpRule {
  id: string;
  name: string;
  days_after_reply: number;
  subject: string;
  body: string;
  max_count: number;
  active: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
}

export type FollowUpRuleInsert = Partial<FollowUpRule> &
  Pick<FollowUpRule, "name" | "days_after_reply" | "subject" | "body">;
export type FollowUpRuleUpdate = Partial<FollowUpRule>;

export interface FollowUp {
  id: string;
  inquiry_id: string;
  rule_id: string | null;
  scheduled_for: string;
  sent_at: string | null;
  cancelled_at: string | null;
  outbound_email_id: string | null;
  attempts: number;
  last_error: string | null;
  failed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type FollowUpInsert = Partial<FollowUp> &
  Pick<FollowUp, "inquiry_id" | "scheduled_for">;
export type FollowUpUpdate = Partial<FollowUp>;

export interface Setting {
  key: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

export type SettingInsert = Partial<Setting> & Pick<Setting, "key">;
export type SettingUpdate = Partial<Setting>;

/** Fotos für model_families/models (Tabelle `photos`), ausgeliefert über
 * GET /api/photos/[id] (siehe docs/umbau-railway.md). */
export interface Photo {
  id: string;
  kind: PhotoKind;
  owner_id: string;
  content_type: string;
  bytes: Buffer;
  size: number;
  sha1: string;
  created_at: string;
}

export type PhotoInsert = Partial<Photo> &
  Pick<Photo, "kind" | "owner_id" | "content_type" | "bytes" | "size" | "sha1">;
export type PhotoUpdate = Partial<Photo>;

/** Effektive Serienleistung einer Anfrage, siehe inquiries.series_ps und
 * components/flow/state.ts effectiveSeriesPs(). Eigener Name statt
 * `Inquiry["series_ps"]` an den Stellen, die nur diesen einen Wert
 * durchreichen (Abschluss-Screen, Teilen-Seite, Mails). */
export type InquirySeriesPs = Inquiry["series_ps"];

// --- Enum-Union-Typen (siehe check-Constraints in db/migrations/0001_init.sql) ---

/** products.category, inquiries.categories[]. Muss mit lib/pricelist/types.ts übereinstimmen. */
export type FlowCategory =
  | "motor"
  | "auspuff"
  | "fahrwerk"
  | "raeder"
  | "exterieur"
  | "interieur";

export const FLOW_CATEGORIES: readonly FlowCategory[] = [
  "motor",
  "auspuff",
  "fahrwerk",
  "raeder",
  "exterieur",
  "interieur",
];

/** products.price_status */
export type PriceStatus = "priced" | "in_preparation" | "on_request";

/** inquiries.status */
export type InquiryStatus = "neu" | "in_bearbeitung" | "beantwortet" | "abgeschlossen";

/** inquiries.source */
export type InquirySource = "web" | "quick";

/** inquiries.locale */
export type Locale = "de" | "en";

/** inquiries.character */
export type Character = "dezent" | "sportlich" | "maximum";

/** inquiries.timing (Zeitraum-Chips, sprachneutrale ID, siehe lib/i18n) */
export type Timing = "asap" | "m1_2" | "m3_6" | "flexible";

/** inquiries.channel (bevorzugter Kanal, sprachneutrale ID) */
export type Channel = "phone" | "email" | "whatsapp";

/** models.fuel */
export type Fuel = "benzin" | "diesel" | "elektro";

/** products.gearbox: aus dem Produktnamen abgeleitet (lib/catalog/gearbox.ts), null = getriebeneutral. */
export type Gearbox = "manual" | "automatic";

/** inquiries.gearbox: Antwort auf die Getriebefrage, "unknown" ist ein eigener Wert (siehe Migration). */
export type InquiryGearbox = "manual" | "automatic" | "unknown";

/** model_families.brand */
export type Brand = "BMW" | "MINI" | "Toyota" | "Wiesmann";

/** outbound_emails.type */
export type EmailType = "confirmation" | "inbox" | "summary" | "reply" | "follow_up";

/** outbound_emails.status */
export type EmailStatus = "sent" | "failed";

/** pricelist_imports.status */
export type PricelistImportStatus = "pending" | "applied" | "discarded" | "failed";

/** photos.kind */
export type PhotoKind = "family" | "model";
