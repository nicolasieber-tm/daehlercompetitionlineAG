// Bequeme Row/Insert/Update-Aliase für die Tabellen aus
// supabase/migrations/20260911000000_init.sql, plus die literalen
// Enum-Union-Typen für die per check-Constraint eingeschränkten
// text-Spalten (siehe database.types.ts: dort bleiben diese Spalten
// bewusst als `string` getippt, wie es `supabase gen types` auch täte).
//
// FlowCategory muss mit lib/pricelist/types.ts kompatibel bleiben
// (dort: FlowCategory = 'motor'|'auspuff'|'fahrwerk'|'raeder'|'exterieur'|'interieur').

import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];

// --- Katalog ---------------------------------------------------------------

export type ModelFamily = Tables["model_families"]["Row"];
export type ModelFamilyInsert = Tables["model_families"]["Insert"];
export type ModelFamilyUpdate = Tables["model_families"]["Update"];

export type Model = Tables["models"]["Row"];
export type ModelInsert = Tables["models"]["Insert"];
export type ModelUpdate = Tables["models"]["Update"];

export type Product = Tables["products"]["Row"];
export type ProductInsert = Tables["products"]["Insert"];
export type ProductUpdate = Tables["products"]["Update"];

export type ProductFitment = Tables["product_fitment"]["Row"];
export type ProductFitmentInsert = Tables["product_fitment"]["Insert"];
export type ProductFitmentUpdate = Tables["product_fitment"]["Update"];

export type PricelistNote = Tables["pricelist_notes"]["Row"];
export type PricelistNoteInsert = Tables["pricelist_notes"]["Insert"];
export type PricelistNoteUpdate = Tables["pricelist_notes"]["Update"];

export type PricelistImport = Tables["pricelist_imports"]["Row"];
export type PricelistImportInsert = Tables["pricelist_imports"]["Insert"];
export type PricelistImportUpdate = Tables["pricelist_imports"]["Update"];

// --- Anfragen ----------------------------------------------------------

export type Inquiry = Tables["inquiries"]["Row"];
export type InquiryInsert = Tables["inquiries"]["Insert"];
export type InquiryUpdate = Tables["inquiries"]["Update"];

export type OutboundEmail = Tables["outbound_emails"]["Row"];
export type OutboundEmailInsert = Tables["outbound_emails"]["Insert"];
export type OutboundEmailUpdate = Tables["outbound_emails"]["Update"];

export type FollowUpRule = Tables["follow_up_rules"]["Row"];
export type FollowUpRuleInsert = Tables["follow_up_rules"]["Insert"];
export type FollowUpRuleUpdate = Tables["follow_up_rules"]["Update"];

export type FollowUp = Tables["follow_ups"]["Row"];
export type FollowUpInsert = Tables["follow_ups"]["Insert"];
export type FollowUpUpdate = Tables["follow_ups"]["Update"];

export type Setting = Tables["settings"]["Row"];
export type SettingInsert = Tables["settings"]["Insert"];
export type SettingUpdate = Tables["settings"]["Update"];

// --- Enum-Union-Typen (siehe check-Constraints in der Migration) -----------

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
export type PricelistImportStatus = "pending" | "applied" | "discarded";
