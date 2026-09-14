// Kontext-Typen für die Mailvorlagen (lib/mail/templates/*.ts). Siehe
// docs/architektur.md, Abschnitt "Mail".
import type { Inquiry, Model, ModelFamily, PriceStatus } from "@/lib/supabase/rows";
import type { Locale } from "@/lib/i18n/dictionaries";

/** Eine Position (gewähltes Produkt) im Paket, wie sie die Mail anzeigt. */
export interface MailInquiryItem {
  /** Flow-Kategorie (motor | auspuff | fahrwerk | raeder | exterieur | interieur). */
  category: string;
  name: string;
  description: string | null;
  price_total: number | null;
  price_status: PriceStatus;
}

/** Ein Prüfhinweis (lib/rules/checks.ts). */
export interface MailCheck {
  id: string;
  text: string;
}

/**
 * Gemeinsamer Kontext für confirmation, summary, inbox und reply. Preise
 * und Positionen kommen bereits fertig aus der DB (nie vom Client), siehe
 * docs/architektur.md, Abschnitt "Anfrage anlegen".
 */
export interface MailInquiryContext {
  inquiry: Inquiry;
  family: ModelFamily | null;
  model: Model | null;
  items: MailInquiryItem[];
  estimatedTotal: number | null;
  checks: MailCheck[];
  /** Antwortentwurf (lib/draft/template.ts): Betreff und vollständiger, bereits bearbeiteter Text. */
  draft: { subject: string; body: string };
  locale: Locale;
  appUrl: string;
  shareUrl: string;
  adminUrl: string;
}

/**
 * Eigener Kontext für follow_up: anders als bei den vier Vorlagen oben kommt
 * der Text hier nicht aus lib/draft (Antwortentwurf), sondern aus der
 * konfigurierten Regel (follow_up_rules.subject/body, Platzhalter
 * {{vorname}}, {{name}}, {{fahrzeug}}, {{nummer}}) plus der Signatur aus
 * settings, siehe docs/architektur.md, Abschnitt "Follow-ups" und CLAUDE.md,
 * Abschnitt "Follow-ups (Posten 6)". Absichtlich kein MailInquiryContext:
 * lib/followups (noch nicht gebaut) kennt zum Zeitpunkt des Versands weder
 * die ursprünglichen Positionen noch den Prüfhinweise-Stand der Anfrage,
 * nur Regel, Anfrage-Stammdaten und Signatur.
 */
export interface MailFollowUpContext {
  inquiry: Pick<Inquiry, "id" | "first_name" | "last_name" | "number" | "email">;
  /** Anzeige-Text fürs Fahrzeug für den Platzhalter {{fahrzeug}}, z.B. "BMW M3 Touring" oder inquiries.vehicle_text. */
  vehicleLabel: string;
  rule: { subject: string; body: string };
  settings: { signatureName: string; companyAddress: string; signaturePhone: string };
  locale: Locale;
}
