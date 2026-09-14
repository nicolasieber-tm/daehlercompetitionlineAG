// Teilen-Link für eine Anfrage ("Paket als Link teilen", siehe CLAUDE.md
// Kundenflow Schritt 6, und docs/architektur.md Abschnitt "Kundenflow").
// Der Token wird in der App erzeugt (nicht per DB-Funktion generate_share_
// token(), die laut docs/db.md nur ein optionaler Fallback ist).
import { nanoid } from "nanoid";
import { createAdminClient } from "@/lib/supabase/admin";
import { vehicleDisplayLabel } from "@/lib/catalog/vehicle-label";

const SHARE_TOKEN_LENGTH = 22;

/**
 * URL-sicherer, 22-stelliger Token (nanoid-Standardalphabet ist bereits
 * A-Za-z0-9_- , siehe https://github.com/ai/nanoid). inquiries.share_token
 * ist unique (siehe supabase/migrations/20260911000000_init.sql); bei
 * einer der astronomisch unwahrscheinlichen Kollisionen liefert der
 * Insert in lib/inquiry/create.ts einen DB-Fehler statt eine Anfrage mit
 * fremdem Token zu überschreiben.
 */
export function generateShareToken(): string {
  return nanoid(SHARE_TOKEN_LENGTH);
}

/** Öffentliche URL der read-only Ansicht (app/p/[token]/page.tsx). */
export function shareUrl(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl.replace(/\/$/, "")}/p/${token}`;
}

/**
 * Read-only Ansichtsdaten für app/p/[token]/page.tsx und
 * app/api/p/[token]/route.ts. Ohne Kontaktdaten ausser Vorname (siehe
 * Aufgabenstellung): der Link kann weitergeleitet werden (CLAUDE.md
 * Kundenflow "Zum Teilen mit Kollegen, Partnerin, Stammtisch."), Telefon/
 * E-Mail/Nachname/Ort/Kanal des Anfragenden gehen niemanden sonst etwas an.
 */
export interface SharedInquiryView {
  number: string;
  firstName: string | null;
  vehicleLabel: string;
  year: string | null;
  character: string | null;
  categories: string[];
  consulting: boolean;
  items: Array<{
    category: string;
    name: string;
    description: string | null;
    priceTotal: number | null;
    priceStatus: string;
  }>;
  estimatedTotal: number | null;
  locale: string;
  createdAt: string;
}

/**
 * Lädt die read-only Ansicht per Teilen-Token. null, wenn der Token nicht
 * existiert (dann liefert der Aufrufer 404, siehe
 * app/api/p/[token]/route.ts). Läuft über den Service-Role-Client: die
 * inquiries-Tabelle hat keine anon-Select-Policy (siehe docs/db.md
 * Abschnitt "Sicherheit", inquiries ist "alle Operationen nur für
 * authenticated"), der Teilen-Link ist aber bewusst ohne Login erreichbar
 * (CLAUDE.md: "echter Link auf eine read-only Ansicht der Anfrage") - der
 * Token selbst (22 Zeichen, nicht erratbar) übernimmt die Zugriffskontrolle
 * anstelle von RLS.
 */
export async function getInquiryByShareToken(token: string): Promise<SharedInquiryView | null> {
  const admin = createAdminClient();
  const { data: inquiry, error } = await admin
    .from("inquiries")
    .select(
      "number, first_name, vehicle_text, year, character, categories, consulting, selections, estimated_total, locale, created_at, family_id, model_id",
    )
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw new Error(`getInquiryByShareToken fehlgeschlagen: ${error.message}`);
  if (!inquiry) return null;

  let family: { brand: string; name: string } | null = null;
  let model: { name: string } | null = null;
  if (inquiry.family_id) {
    const { data, error: familyError } = await admin
      .from("model_families")
      .select("brand, name")
      .eq("id", inquiry.family_id)
      .maybeSingle();
    if (familyError) throw new Error(`getInquiryByShareToken (Familie) fehlgeschlagen: ${familyError.message}`);
    family = data;
  }
  if (inquiry.model_id) {
    const { data, error: modelError } = await admin
      .from("models")
      .select("name")
      .eq("id", inquiry.model_id)
      .maybeSingle();
    if (modelError) throw new Error(`getInquiryByShareToken (Modell) fehlgeschlagen: ${modelError.message}`);
    model = data;
  }

  // Dieselbe gemeinsame Formel wie überall sonst (Mail, Antwortentwurf,
  // Kundenflow), siehe lib/catalog/vehicle-label.ts (Prüfung, Befund 3):
  // eine frühere, eigene Kopie dieser Funktion liess hier bei vorhandenem
  // Modell den Familiennamen weg und hängte stattdessen einen Baureihen-
  // Code an (Blocker-Befund, siehe lib/mail/render.ts Kommentar-Historie).
  const vehicleLabel = vehicleDisplayLabel({ family, model, vehicleText: inquiry.vehicle_text });

  const selections = Array.isArray(inquiry.selections) ? inquiry.selections : [];
  const items = (selections as unknown as Array<Record<string, unknown>>).map((s) => ({
    category: String(s.category ?? ""),
    name: String(s.name ?? ""),
    description: (s.description as string | null) ?? null,
    priceTotal: (s.price_total as number | null) ?? null,
    priceStatus: String(s.price_status ?? "on_request"),
  }));

  return {
    number: inquiry.number,
    firstName: inquiry.first_name,
    vehicleLabel,
    year: inquiry.year,
    character: inquiry.character,
    categories: inquiry.categories,
    consulting: inquiry.consulting,
    items,
    estimatedTotal: inquiry.estimated_total,
    locale: inquiry.locale,
    createdAt: inquiry.created_at,
  };
}
