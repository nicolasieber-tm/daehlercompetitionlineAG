// Baut den gemeinsamen Mail-Kontext (lib/mail/types.ts MailInquiryContext)
// aus einer bereits gespeicherten Anfrage. Wird von lib/inquiry/create.ts
// (Bestätigung + Anfrage-Mail direkt nach dem Anlegen) UND vom Admin
// verwendet (Antwort senden, siehe docs/architektur.md Abschnitt "Admin":
// "Senden (via Resend, BCC info@)" - Posten Admin ist nicht Teil dieser
// Aufgabe, das Modul liegt aber bereits hier bereit, wie in der
// Aufgabenstellung verlangt: "Wird auch vom Admin (reply) genutzt").
import { sql } from "@/lib/db/client";
import type { Inquiry, Model, ModelFamily } from "@/lib/db/rows";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { MailCheck, MailInquiryContext, MailInquiryItem } from "@/lib/mail/types";
import { shareUrl } from "./share";

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * inquiries.selections ist jsonb (siehe docs/db.md), an dieser Stelle immer
 * bereits im von lib/inquiry/create.ts geschriebenen Format (product_id,
 * category, name, description, price_total, price_status, ps_to, nm_to).
 * Robust gegen eine leere/fremde Struktur (defensiv, kein throw): eine
 * fehlerhafte Positionsliste darf den Mailversand einer sonst gültigen
 * Anfrage nicht verhindern.
 *
 * ps_to/nm_to (Prüfung, Befund 4): nur bei Motor-Leistungsprodukten
 * gefüllt (siehe lib/mail/types.ts MailInquiryItem-Kommentar), auf
 * MailInquiryItem deshalb optional statt `number | null` - eine ältere,
 * vor dieser Korrektur gespeicherte Anfrage hat diese Felder in ihrem
 * gespeicherten inquiries.selections schlicht nicht, `e.ps_to`/`e.nm_to`
 * sind dort `undefined` und bleiben so (kein `null` vortäuschen).
 * lib/mail/templates/inbox.ts goalLine() nutzt sie, wenn vorhanden, für die
 * ZIEL-Zeile ("ca. 620 PS / 740 Nm" statt der bis dahin gezeigten
 * products.description).
 *
 * variant_group (Korrektur 15.09.2026, Prüfung Modul Produkte, Befund 2):
 * ebenso optional und ebenso `undefined` statt `null` bei einer älteren,
 * vor dieser Korrektur gespeicherten Anfrage - lib/catalog/product-display.ts
 * isStageItem() unterscheidet genau danach (fehlend -> Fallback auf
 * `ps_to != null`; vorhanden, auch `null` -> massgeblich). `e.variant_group`
 * kann in der DB `null` sein (products.variant_group ist nullable), das
 * bleibt hier bewusst erhalten statt zu `undefined` zu werden.
 */
function parseItems(raw: unknown): MailInquiryItem[] {
  if (!Array.isArray(raw)) return [];
  const items: MailInquiryItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.category !== "string" || typeof e.name !== "string") continue;
    const item: MailInquiryItem = {
      category: e.category,
      name: e.name,
      description: typeof e.description === "string" ? e.description : null,
      price_total: typeof e.price_total === "number" ? e.price_total : null,
      price_status: (typeof e.price_status === "string" ? e.price_status : "on_request") as MailInquiryItem["price_status"],
      ps_to: typeof e.ps_to === "number" ? e.ps_to : null,
      nm_to: typeof e.nm_to === "number" ? e.nm_to : null,
    };
    if ("variant_group" in e) {
      item.variant_group = typeof e.variant_group === "string" ? e.variant_group : null;
    }
    items.push(item);
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
 * Läuft über den einzigen, serverseitigen Postgres-Pool (kein RLS mehr,
 * siehe docs/umbau-railway.md): sowohl der öffentliche Erstell-Weg
 * (lib/inquiry/create.ts) als auch der Admin (Antwort senden) verwenden
 * denselben Zugriff, ein eigener Client-Parameter ist nicht mehr nötig.
 */
export async function buildMailContext(inquiryId: string): Promise<MailInquiryContext> {
  const [inquiry] = await sql<Inquiry[]>`select * from inquiries where id = ${inquiryId}`;
  if (!inquiry) throw new Error(`buildMailContext: Anfrage ${inquiryId} nicht gefunden.`);

  const [family] = inquiry.family_id
    ? await sql<ModelFamily[]>`select * from model_families where id = ${inquiry.family_id}`
    : [];
  const [model] = inquiry.model_id
    ? await sql<Model[]>`select * from models where id = ${inquiry.model_id}`
    : [];

  return {
    inquiry,
    family: family ?? null,
    model: model ?? null,
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
