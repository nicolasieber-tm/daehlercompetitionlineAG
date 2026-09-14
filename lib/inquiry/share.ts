// Teilen-Link für eine Anfrage ("Paket als Link teilen", siehe CLAUDE.md
// Kundenflow Schritt 6, und docs/architektur.md Abschnitt "Kundenflow").
// Der Token wird in der App erzeugt (nicht per DB-Funktion generate_share_
// token(), die laut docs/db.md nur ein optionaler Fallback ist).
import { nanoid } from "nanoid";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderFamilyName } from "@/lib/mail/render";

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

  let family: { brand: string; name: string; codes: string[] } | null = null;
  let model: { name: string } | null = null;
  if (inquiry.family_id) {
    const { data, error: familyError } = await admin
      .from("model_families")
      .select("brand, name, codes")
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

  // Dieselbe Marke/Modell-Dublette-Logik wie überall sonst (Mail,
  // Antwortentwurf), siehe lib/mail/render.ts vehicleLabel(). Kein Import
  // der vollen vehicleLabel(): die erwartet die vollen ModelFamily/Model-
  // Row-Typen (u.a. id, slug, active, created_at, ...), hier liegt bewusst
  // nur ein schlanker Ausschnitt vor (Sicherheitsprinzip "so wenig wie
  // nötig" laden für eine öffentlich ohne Login erreichbare Route). Eine
  // dritte, schmalere vehicleLabel()-Variante an einem gemeinsamen Ort wäre
  // sauberer, war aber nicht Teil der zugewiesenen Dateien, siehe Bericht.
  //
  // vehicle_text VOR dem Familien-Fallback (Befund #1 der Anfrage-Prüfung:
  // "vehicle_text wird ... nie verwendet", dieselbe Korrektur wie in
  // vehicleLabel()); isPlaceholderFamilyName() wird von dort importiert
  // (reine Namensprüfung, kein Row-Typ nötig), damit die Erkennung der drei
  // Kurzablauf-Platzhalterfamilien nicht ein zweites Mal dupliziert wird.
  const vehicleText = inquiry.vehicle_text?.trim() || null;
  const vehicleLabel = (() => {
    if (!family) return vehicleText ?? "";
    const startsWithBrand = (text: string) => text.toLowerCase().startsWith(family!.brand.toLowerCase());
    if (!model) {
      if (vehicleText) return vehicleText;
      if (isPlaceholderFamilyName(family.name)) return family.brand;
      return startsWithBrand(family.name) ? family.name : `${family.brand} ${family.name}`;
    }
    const modelLabel = startsWithBrand(model.name) ? model.name : `${family.brand} ${model.name}`;
    return family.codes.length === 1 ? `${modelLabel} ${family.codes[0]}` : modelLabel;
  })();

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
