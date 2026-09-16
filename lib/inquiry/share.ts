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
  /**
   * Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
   * die effektiv wirksame Serienleistung zum Zeitpunkt der Anfrage
   * (inquiries.series_ps, siehe lib/inquiry/create.ts) - für die Vorher-
   * Zahl der Vorher/Nachher-Leistungszeile (lib/catalog/before-after.ts
   * buildBeforeAfterRows(), verwendet von app/p/[token]/page.tsx).
   */
  seriesPs: number | null;
  /** models.series_nm des gewählten Modells, nur wenn bekannt (statisch je Modell, deshalb hier per Join statt eigener inquiries-Spalte). */
  seriesNm: number | null;
  items: Array<{
    category: string;
    // Nachzug Prüfung Phase D, Punkt 1: name/description sind hier bewusst
    // der ROHE Excel-Name/die Beschreibung (nicht mehr über
    // displayItemFields() vorgefaltet) - variantGroup/psTo/nmTo werden
    // zusätzlich mitgegeben, damit app/p/[token]/page.tsx dieselbe
    // Darstellung wie die Kachel/die Mails selbst über
    // productDisplay()/displayItemFields() ableiten kann (mit Locale), statt
    // einer eigenen, an dieser Stelle nicht wiederverwendbaren Kopie. Siehe
    // dort für die tatsächliche Verwendung.
    name: string;
    description: string | null;
    variantGroup: string | null;
    psTo: number | null;
    nmTo: number | null;
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
      "number, first_name, vehicle_text, year, character, categories, consulting, selections, estimated_total, locale, created_at, family_id, model_id, series_ps",
    )
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw new Error(`getInquiryByShareToken fehlgeschlagen: ${error.message}`);
  if (!inquiry) return null;

  let family: { brand: string; name: string; codes: string[] } | null = null;
  let model: { name: string; series_nm: number | null } | null = null;
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
    // series_nm zusätzlich zu name (Rückmeldung zweiter Klicktest, CLAUDE.md
    // Abschnitt "AUFGABE", Punkt 3): statisch je Modell, deshalb per Join
    // statt einer eigenen inquiries-Spalte (anders als series_ps, das die
    // ambivalente Chip-Auswahl im Fahrzeug-Schritt festhält).
    const { data, error: modelError } = await admin
      .from("models")
      .select("name, series_nm")
      .eq("id", inquiry.model_id)
      .maybeSingle();
    if (modelError) throw new Error(`getInquiryByShareToken (Modell) fehlgeschlagen: ${modelError.message}`);
    model = data;
  }

  // Dieselbe gemeinsame Formel wie überall sonst (Mail, Antwortentwurf,
  // Kundenflow), siehe lib/catalog/vehicle-label.ts und docs/architektur.md
  // Abschnitt "Fahrzeugbezeichnung".
  const vehicleLabel = vehicleDisplayLabel(family, model, inquiry.vehicle_text);

  // Nachzug Prüfung Phase D, Punkt 1: name/description/variantGroup/psTo/
  // nmTo werden ROH aus inquiries.selections durchgereicht (variant_group
  // wird seit lib/inquiry/create.ts, Korrektur 15.09.2026 Befund 2, mit
  // persistiert) - app/p/[token]/page.tsx leitet daraus selbst dieselbe
  // Positionsdarstellung wie im Antwortentwurf/den Mails ab ("Stufe 1 (590
  // PS / 720 Nm, M6 & A8-Getriebe)" statt des vollen, mehrdeutigen
  // Excel-Namens, über displayItemFields()/productDisplay() mit Locale),
  // sowohl für die Summary als auch für Vorher/Nachher
  // (lib/catalog/before-after.ts, das dafür ebenfalls variantGroup/psTo/
  // nmTo braucht, nicht nur den fertig gefalteten Namen).
  const items = (Array.isArray(inquiry.selections) ? inquiry.selections : []).map((s) => {
    const row = s as unknown as Record<string, unknown>;
    return {
      category: String(row.category ?? ""),
      name: String(row.name ?? ""),
      description: (row.description as string | null) ?? null,
      variantGroup: (row.variant_group as string | null) ?? null,
      psTo: typeof row.ps_to === "number" ? row.ps_to : null,
      nmTo: typeof row.nm_to === "number" ? row.nm_to : null,
      priceTotal: (row.price_total as number | null) ?? null,
      priceStatus: String(row.price_status ?? "on_request"),
    };
  });

  return {
    number: inquiry.number,
    firstName: inquiry.first_name,
    vehicleLabel,
    year: inquiry.year,
    character: inquiry.character,
    categories: inquiry.categories,
    consulting: inquiry.consulting,
    seriesPs: inquiry.series_ps,
    seriesNm: model?.series_nm ?? null,
    items,
    estimatedTotal: inquiry.estimated_total,
    locale: inquiry.locale,
    createdAt: inquiry.created_at,
  };
}
