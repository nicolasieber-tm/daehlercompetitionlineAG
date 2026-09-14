// Baut den gemeinsamen Mail-Kontext (lib/mail/types.ts MailInquiryContext)
// aus einer bereits gespeicherten Anfrage. Wird von lib/inquiry/create.ts
// (Bestätigung + Anfrage-Mail direkt nach dem Anlegen) UND vom Admin
// verwendet (Antwort senden, siehe docs/architektur.md Abschnitt "Admin":
// "Senden (via Resend, BCC info@)" - Posten Admin ist nicht Teil dieser
// Aufgabe, das Modul liegt aber bereits hier bereit, wie in der
// Aufgabenstellung verlangt: "Wird auch vom Admin (reply) genutzt").
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MailCheck, MailInquiryContext, MailInquiryItem } from "@/lib/mail/types";
import { shareUrl } from "./share";

type Db = SupabaseClient<Database>;

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * inquiries.selections ist jsonb (siehe docs/db.md), an dieser Stelle immer
 * bereits im von lib/inquiry/create.ts geschriebenen Format (product_id,
 * category, name, description, price_total, price_status). Robust gegen
 * eine leere/fremde Struktur (defensiv, kein throw): eine fehlerhafte
 * Positionsliste darf den Mailversand einer sonst gültigen Anfrage nicht
 * verhindern.
 */
function parseItems(raw: unknown): MailInquiryItem[] {
  if (!Array.isArray(raw)) return [];
  const items: MailInquiryItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.category !== "string" || typeof e.name !== "string") continue;
    items.push({
      category: e.category,
      name: e.name,
      description: typeof e.description === "string" ? e.description : null,
      price_total: typeof e.price_total === "number" ? e.price_total : null,
      price_status: (typeof e.price_status === "string" ? e.price_status : "on_request") as MailInquiryItem["price_status"],
    });
  }
  return items;
}

function parseChecks(raw: unknown): MailCheck[] {
  if (!Array.isArray(raw)) return [];
  const checks: MailCheck[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id === "string" && typeof e.text === "string") checks.push({ id: e.id, text: e.text });
  }
  return checks;
}

/**
 * Lädt Anfrage, Familie, Modell und baut daraus den MailInquiryContext für
 * confirmation/summary/inbox/reply (lib/mail sendInquiryMail()). Preise und
 * Positionen kommen unverändert aus inquiries.selections (bereits
 * serverseitig zum Zeitpunkt des Anlegens berechnet, siehe
 * lib/inquiry/create.ts) - hier wird nichts neu berechnet.
 *
 * db optional (Standard: Service-Role-Client): der öffentliche Erstell-Weg
 * (lib/inquiry/create.ts, ohne Admin-Session) MUSS den Service-Role-Client
 * verwenden, inquiries hat keine anon/eigene-Zeile-Policy (siehe docs/db.md
 * Abschnitt "Sicherheit": inquiries "alle Operationen nur für
 * authenticated"). Ein Admin-Aufrufer kann optional seinen eigenen
 * (Session-)Client übergeben.
 */
export async function buildMailContext(inquiryId: string, db?: Db): Promise<MailInquiryContext> {
  const client = db ?? createAdminClient();

  const { data: inquiry, error: inquiryError } = await client
    .from("inquiries")
    .select("*")
    .eq("id", inquiryId)
    .maybeSingle();
  if (inquiryError) throw new Error(`buildMailContext: Anfrage konnte nicht geladen werden: ${inquiryError.message}`);
  if (!inquiry) throw new Error(`buildMailContext: Anfrage ${inquiryId} nicht gefunden.`);

  const [familyRes, modelRes] = await Promise.all([
    inquiry.family_id
      ? client.from("model_families").select("*").eq("id", inquiry.family_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    inquiry.model_id
      ? client.from("models").select("*").eq("id", inquiry.model_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);
  if (familyRes.error) throw new Error(`buildMailContext: Familie konnte nicht geladen werden: ${familyRes.error.message}`);
  if (modelRes.error) throw new Error(`buildMailContext: Modell konnte nicht geladen werden: ${modelRes.error.message}`);

  return {
    inquiry,
    family: familyRes.data,
    model: modelRes.data,
    items: parseItems(inquiry.selections),
    estimatedTotal: inquiry.estimated_total,
    checks: parseChecks(inquiry.checks),
    draft: { subject: inquiry.draft_subject ?? "", body: inquiry.draft_reply ?? "" },
    locale: (inquiry.locale as Locale) ?? "de",
    appUrl: appUrl(),
    shareUrl: shareUrl(inquiry.share_token),
    adminUrl: `${appUrl()}/admin/anfragen/${inquiry.id}`,
  };
}
