// Admin-Datenzugriff für Anfragen: Übersicht (Filter, Suche, Pagination) und
// Detailansicht (Zusammenfassung, Antwortentwurf, Mail-Protokoll,
// Follow-ups), siehe docs/architektur.md, Abschnitt "Admin", und die
// Aufgabenstellung "Admin Teil 1".
//
// Liest/schreibt über den Server-Client (Session-Cookies, RLS): die Policy
// `inquiries_all_authenticated` (siehe supabase/migrations/
// 20260911000000_init.sql) gibt jedem eingeloggten Admin-User volle Rechte,
// ein Service-Role-Client ist für diese Lesezugriffe nicht nötig. Aufrufer
// können trotzdem einen eigenen Client übergeben (Tests gegen die lokale
// DB, siehe tests/admin/inquiries.test.ts, nutzen dafür den
// Service-Role-Client wie die übrigen Tests, z.B. tests/mail/resend.test.ts).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { vehicleLabel } from "@/lib/mail/render";
import { getFamilies } from "@/lib/catalog/queries";
import { getProductsByIds } from "@/lib/catalog/queries";
import { getSettings } from "@/lib/mail/settings";
import { buildMailContext } from "@/lib/inquiry/context";
import { buildDraft } from "@/lib/draft/template";
import type { DraftContext, DraftItem } from "@/lib/draft/template";
import type {
  Character,
  FlowCategory,
  FollowUp,
  Inquiry,
  InquirySource,
  InquiryStatus,
  Locale,
  Model,
  ModelFamily,
  OutboundEmail,
  Timing,
} from "@/lib/supabase/rows";
import type { MailInquiryContext } from "@/lib/mail/types";

type Db = SupabaseClient<Database>;

async function resolveClient(db?: Db): Promise<Db> {
  return db ?? (await createServerClient());
}

export const INQUIRY_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Übersicht: Filter, Suche, Pagination
// ---------------------------------------------------------------------------

export interface InquiryListFilters {
  /** "alle" oder undefined = kein Status-Filter. */
  status?: InquiryStatus | "alle";
  familyId?: string;
  /** "YYYY-MM-DD", inklusive. */
  dateFrom?: string;
  /** "YYYY-MM-DD", inklusive. */
  dateTo?: string;
  /** Freitext, sucht in Nummer, Vorname, Name, E-Mail, Ort (ilike). */
  search?: string;
  /** 1-basiert. */
  page?: number;
}

export interface InquiryListRow {
  id: string;
  number: string;
  createdAt: string;
  customerName: string;
  city: string | null;
  email: string | null;
  vehicleLabel: string;
  categories: FlowCategory[];
  consulting: boolean;
  estimatedTotal: number | null;
  status: InquiryStatus;
  source: InquirySource;
}

export interface InquiryListResult {
  rows: InquiryListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

// ---------------------------------------------------------------------------
// URL-Parameter-Validierung (app/admin/page.tsx, Prüfbefund admin-page,
// Punkt 2): reine Funktionen hier statt direkt in der Server Component,
// damit sie ohne deren React-/Next.js-Importkette getestet werden können
// (siehe tests/admin/page-params.test.ts). Ein ungültiger Parameter wird
// ignoriert (Rückgabe undefined/Standardwert) statt einen Fehler zu werfen -
// app/admin/page.tsx darf bei einer von Hand verstümmelten URL nie mit 500
// abstürzen. Ob eine syntaktisch gültige "page" auch tatsächlich existiert
// (page ≤ Seitenzahl), stellt sich erst bei der Datenbankabfrage heraus -
// das fängt der PostgREST-416-Fallback in listInquiries() unten ab
// (RANGE_NOT_SATISFIABLE_CODE), nicht diese Funktion.
// ---------------------------------------------------------------------------

const STATUS_PARAM_VALUES: InquiryStatus[] = ["neu", "in_bearbeitung", "beantwortet", "abgeschlossen"];

export function parseStatusParam(value: string | undefined): InquiryStatus | "alle" {
  if (value && (STATUS_PARAM_VALUES as string[]).includes(value)) return value as InquiryStatus;
  return "alle";
}

export function parsePageParam(value: string | undefined): number {
  const n = value ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

// "YYYY-MM-DD", wie <input type="date"> es liefert (FilterBar.tsx).
const DATE_PARAM_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Nur syntaktisch gültige UND tatsächlich existierende Kalendertage (2026-02-30 z.B. nicht) kommen durch. */
export function parseDateParam(value: string | undefined): string | undefined {
  if (!value || !DATE_PARAM_RE.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    asDate.getUTCFullYear() === year && asDate.getUTCMonth() === month - 1 && asDate.getUTCDate() === day;
  return roundTrips ? value : undefined;
}

const UUID_PARAM_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFamilyIdParam(value: string | undefined): string | undefined {
  return value && UUID_PARAM_RE.test(value) ? value : undefined;
}

/**
 * Entfernt Zeichen, die die PostgREST-`or()`-Filterliste ("spalte.ilike.%
 * wert%,spalte2.ilike.%wert%") sprengen würden (Komma trennt die
 * Teilausdrücke, Klammern haben dort ebenfalls Sonderbedeutung). Eine
 * Sucheingabe mit Komma/Klammern soll nicht zu einem Query-Fehler führen,
 * sondern einfach ohne diese Zeichen gesucht werden.
 */
function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()%]/g, " ").trim();
}

/**
 * Offset (ms) von Europe/Zurich gegenüber UTC zum Zeitpunkt `atUtcMs`
 * (+7200000 im Sommer/CEST, +3600000 im Winter/CET). Ermittelt über
 * Intl.DateTimeFormat statt einer festen Verschiebung, damit die Zeitum-
 * stellung (letzter Sonntag im März/Oktober) automatisch stimmt.
 */
function zurichOffsetMs(atUtcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Zurich",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(atUtcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - atUtcMs;
}

/**
 * UTC-Zeitfenster (inklusive) eines Kalendertags "YYYY-MM-DD" in
 * Europe/Zurich - Gegenstück zu zurichDateString() in
 * lib/followups/schedule.ts (dort Date -> Zürich-Tag, hier Zürich-Tag ->
 * UTC-Zeitfenster). Prüfbefund (admin-shell, Punkt 2): created_at (UTC)
 * direkt mit `${date}T00:00:00.000Z`/`T23:59:59.999Z` zu vergleichen macht
 * den Von/Bis-Filter tagesabhängig 1-2h falsch, weil die Tabelle das Datum
 * über formatDate() (lib/i18n/format.ts, mit timeZone: "Europe/Zurich")
 * in Schweizer Ortszeit anzeigt: eine Anfrage von 22:30 UTC (00:30 Zürich,
 * Sommerzeit) erscheint dort bereits als "nächster Tag", würde mit den
 * alten UTC-Grenzen aber nicht gefunden. Damit das auch auf einem
 * Produktions-Host mit Server-Zeitzone UTC (Railway-Standard, siehe
 * docs/architektur.md, Abschnitt "Umgebungsvariablen") stimmt, formatiert
 * formatDate() explizit mit Zeitzone statt mit der Server-Zeitzone.
 */
function zurichDayBoundsUtc(dateStr: string): { startUtc: string; endUtc: string } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const offsetMs = zurichOffsetMs(Date.UTC(year, month - 1, day, 0, 0, 0));
  const startUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs).toISOString();
  const endUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs).toISOString();
  return { startUtc, endUtc };
}

/**
 * PostgREST-Fehlercode für "Requested range not satisfiable" (siehe
 * https://postgrest.org/en/stable/references/errors.html): tritt auf, wenn
 * .range(from, to) mit einem `from` jenseits der tatsächlichen Zeilenzahl
 * aufgerufen wird - z.B. ?page=99 bei nur zwei vorhandenen Anfragen. Kommt
 * als HTTP 416 zurück (siehe Prüfbefund admin-page, Punkt 2: "PostgREST 416
 * bei page ausserhalb -> Seite 1"), sonst würde listInquiries() hier einen
 * Fehler werfen und die Seite mit einem 500 abstürzen, nur weil jemand eine
 * zu hohe Seitenzahl in die URL geschrieben hat.
 */
const RANGE_NOT_SATISFIABLE_CODE = "PGRST103";

function buildInquiriesQuery(client: Db, filters: InquiryListFilters, page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from("inquiries")
    .select("*, family:model_families(*), model:models(*)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "alle") {
    query = query.eq("status", filters.status);
  }
  if (filters.familyId) {
    query = query.eq("family_id", filters.familyId);
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", zurichDayBoundsUtc(filters.dateFrom).startUtc);
  }
  if (filters.dateTo) {
    query = query.lte("created_at", zurichDayBoundsUtc(filters.dateTo).endUtc);
  }
  const search = filters.search ? sanitizeSearchTerm(filters.search) : "";
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      [
        `number.ilike.${pattern}`,
        `first_name.ilike.${pattern}`,
        `last_name.ilike.${pattern}`,
        `email.ilike.${pattern}`,
        `city.ilike.${pattern}`,
      ].join(","),
    );
  }

  return query;
}

/**
 * Anfragen für die Übersicht: gefiltert, durchsucht, sortiert (neu zuerst),
 * paginiert (50 pro Seite, siehe INQUIRY_PAGE_SIZE). family/model werden
 * für vehicleLabel() vollständig geladen (siehe lib/mail/render.ts), nicht
 * nur die Anzeigefelder - vehicleLabel() erwartet die vollen Row-Typen.
 */
export async function listInquiries(filters: InquiryListFilters, db?: Db): Promise<InquiryListResult> {
  const client = await resolveClient(db);
  const pageSize = INQUIRY_PAGE_SIZE;
  let page = Math.max(1, Math.floor(filters.page ?? 1));

  let { data, error, count } = await buildInquiriesQuery(client, filters, page, pageSize);
  if (error && error.code === RANGE_NOT_SATISFIABLE_CODE && page !== 1) {
    // Angeforderte Seite liegt jenseits der vorhandenen Zeilen (z.B. Filter
    // seitdem verschärft, oder eine von Hand eingegebene URL): auf Seite 1
    // zurückfallen statt der Nutzerin eine kaputte Seite zu zeigen.
    page = 1;
    ({ data, error, count } = await buildInquiriesQuery(client, filters, page, pageSize));
  }
  if (error) {
    throw new Error(`listInquiries fehlgeschlagen: ${error.message}`);
  }

  const rows: InquiryListRow[] = (
    (data ?? []) as unknown as (Inquiry & { family: ModelFamily | null; model: Model | null })[]
  ).map((row) => ({
    id: row.id,
    number: row.number,
    createdAt: row.created_at,
    customerName: [row.first_name, row.last_name].filter(Boolean).join(" "),
    city: row.city,
    email: row.email,
    vehicleLabel: vehicleLabel({ family: row.family, model: row.model, vehicleText: row.vehicle_text }),
    categories: row.categories as FlowCategory[],
    consulting: row.consulting,
    estimatedTotal: row.estimated_total,
    status: row.status as InquiryStatus,
    source: row.source as InquirySource,
  }));

  const total = count ?? rows.length;
  return { rows, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Anzahl Anfragen mit Status "neu", für den Menü-Zähler (components/admin Sidebar). */
export async function getNewInquiriesCount(db?: Db): Promise<number> {
  const client = await resolveClient(db);
  const { count, error } = await client
    .from("inquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "neu");
  if (error) {
    throw new Error(`getNewInquiriesCount fehlgeschlagen: ${error.message}`);
  }
  return count ?? 0;
}

export interface FamilyFilterOption {
  id: string;
  label: string;
}

/** Baureihen für den Filter-Select, reiht wie getFamilies() (Marke, dann sort/Name). */
export async function getFamilyFilterOptions(db?: Db): Promise<FamilyFilterOption[]> {
  const client = await resolveClient(db);
  const families = await getFamilies(client);
  return families.map((f) => ({ id: f.id, label: `${f.brand} ${f.name}` }));
}

// ---------------------------------------------------------------------------
// Detailansicht
// ---------------------------------------------------------------------------

export interface InquiryFollowUp extends FollowUp {
  ruleName: string | null;
  ruleSubject: string | null;
}

export interface InquiryDetail {
  ctx: MailInquiryContext;
  outboundEmails: OutboundEmail[];
  followUps: InquiryFollowUp[];
}

/**
 * Vollständiger Kontext für die Detailseite. Nutzt buildMailContext()
 * (lib/inquiry/context.ts) für Anfrage/Familie/Modell/Positionen/
 * Prüfhinweise/Entwurf - dieselben Daten, die auch die Mails verwenden,
 * damit Admin-Ansicht und tatsächlich verschickte Mails nie auseinander-
 * laufen. Lädt zusätzlich Mail-Protokoll und Follow-ups dieser Anfrage.
 *
 * db wird bewusst NICHT an buildMailContext() durchgereicht: dessen
 * Default (Service-Role-Client) ist hier unproblematisch, da requireAdmin()
 * die Session bereits geprüft hat, und vermeidet eine RLS-Select-Kette über
 * vier Tabellen mit dem Session-Client extra nachzubilden.
 */
export async function getInquiryDetail(id: string, db?: Db): Promise<InquiryDetail | null> {
  const client = await resolveClient(db);

  const { data: exists, error: existsError } = await client
    .from("inquiries")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (existsError) throw new Error(`getInquiryDetail fehlgeschlagen: ${existsError.message}`);
  if (!exists) return null;

  const [ctx, outboundRes, followUpRes] = await Promise.all([
    buildMailContext(id),
    client
      .from("outbound_emails")
      .select("*")
      .eq("inquiry_id", id)
      .order("created_at", { ascending: false }),
    client
      .from("follow_ups")
      .select("*, rule:follow_up_rules(name, subject)")
      .eq("inquiry_id", id)
      .order("scheduled_for", { ascending: true }),
  ]);

  if (outboundRes.error) throw new Error(`getInquiryDetail (Mail-Protokoll) fehlgeschlagen: ${outboundRes.error.message}`);
  if (followUpRes.error) throw new Error(`getInquiryDetail (Follow-ups) fehlgeschlagen: ${followUpRes.error.message}`);

  const followUps: InquiryFollowUp[] = (
    (followUpRes.data ?? []) as unknown as (FollowUp & { rule: { name: string; subject: string } | null })[]
  ).map((f) => ({ ...f, ruleName: f.rule?.name ?? null, ruleSubject: f.rule?.subject ?? null }));

  return { ctx, outboundEmails: outboundRes.data ?? [], followUps };
}

// ---------------------------------------------------------------------------
// Mutationen (von app/admin/actions/inquiries.ts nach requireAdmin() aufgerufen)
// ---------------------------------------------------------------------------

export async function setInquiryStatus(id: string, status: InquiryStatus, db?: Db): Promise<void> {
  const client = await resolveClient(db);
  const { error } = await client.from("inquiries").update({ status }).eq("id", id);
  if (error) throw new Error(`setInquiryStatus fehlgeschlagen: ${error.message}`);
}

export async function saveDraft(id: string, subject: string, body: string, db?: Db): Promise<void> {
  const client = await resolveClient(db);
  const { error } = await client
    .from("inquiries")
    .update({ draft_subject: subject, draft_reply: body })
    .eq("id", id);
  if (error) throw new Error(`saveDraft fehlgeschlagen: ${error.message}`);
}

/**
 * inquiries.selections speichert nur {product_id, category, name,
 * description, price_total, price_status} (siehe lib/inquiry/create.ts,
 * Schritt 8) - ohne psTo/nmTo/variantGroup, die buildDraft() für den
 * Leistungs-Satz braucht (DraftItem, siehe lib/draft/template.ts). Für die
 * Regenerierung deshalb per getProductsByIds() aus den gespeicherten
 * product_id erneut nachgeladen (aktueller Katalogstand, nicht der Stand
 * zum Zeitpunkt der Anfrage - konsistent mit "Preise nie von Hand ändern,
 * nur über Import", CLAUDE.md). Ein inzwischen deaktiviertes/gelöschtes
 * Produkt liefert dafür einfach keinen Treffer, der Leistungs-Satz entfällt
 * dann (kein Absturz, siehe buildItemLine/buildDraft: stageItem bleibt
 * undefined).
 */
interface StoredSelection {
  product_id?: string;
  category: FlowCategory;
  name: string;
  description: string | null;
  price_total: number | null;
  price_status: DraftItem["priceStatus"];
}

function parseStoredSelections(raw: unknown): StoredSelection[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredSelection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.category !== "string" || typeof e.name !== "string") continue;
    out.push({
      product_id: typeof e.product_id === "string" ? e.product_id : undefined,
      category: e.category as FlowCategory,
      name: e.name,
      description: typeof e.description === "string" ? e.description : null,
      price_total: typeof e.price_total === "number" ? e.price_total : null,
      price_status: (typeof e.price_status === "string" ? e.price_status : "on_request") as StoredSelection["price_status"],
    });
  }
  return out;
}

/**
 * Baut den Antwortentwurf neu, wie buildDraft() ihn bei der ursprünglichen
 * Anfrage erzeugt hätte (siehe lib/inquiry/create.ts, Schritt 6), auf Basis
 * des aktuellen Anfrage-/Einstellungsstands. Persistiert NICHTS - die
 * Admin-Detailseite füllt damit nur die Textarea neu, "Speichern" ist ein
 * eigener, expliziter Schritt (siehe Aufgabenstellung: "«Entwurf neu
 * erzeugen» = buildDraft erneut" getrennt von "speichern per Server
 * Action").
 */
export async function regenerateDraft(id: string, db?: Db): Promise<{ subject: string; body: string }> {
  const client = await resolveClient(db);

  const { data: inquiry, error } = await client.from("inquiries").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`regenerateDraft fehlgeschlagen: ${error.message}`);
  if (!inquiry) throw new Error(`regenerateDraft: Anfrage ${id} nicht gefunden.`);

  const [familyRes, modelRes, settings] = await Promise.all([
    inquiry.family_id
      ? client.from("model_families").select("*").eq("id", inquiry.family_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    inquiry.model_id
      ? client.from("models").select("*").eq("id", inquiry.model_id).maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
    getSettings(),
  ]);
  if (familyRes.error) throw new Error(`regenerateDraft (Familie) fehlgeschlagen: ${familyRes.error.message}`);
  if (modelRes.error) throw new Error(`regenerateDraft (Modell) fehlgeschlagen: ${modelRes.error.message}`);

  const stored = parseStoredSelections(inquiry.selections);
  const productIds = stored.map((s) => s.product_id).filter((v): v is string => !!v);
  const products = productIds.length > 0 ? await getProductsByIds(productIds, client) : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  const items: DraftItem[] = stored.map((s) => {
    const product = s.product_id ? productById.get(s.product_id) : undefined;
    return {
      category: s.category,
      name: s.name,
      description: s.description,
      priceTotal: s.price_total,
      priceStatus: s.price_status,
      psTo: product?.psTo ?? null,
      nmTo: product?.nmTo ?? null,
      variantGroup: product?.variantGroup ?? null,
    };
  });

  const draftCtx: DraftContext = {
    number: inquiry.number,
    firstName: inquiry.first_name ?? "",
    lastName: inquiry.last_name ?? "",
    vehicleLabel: vehicleLabel({ family: familyRes.data, model: modelRes.data, vehicleText: inquiry.vehicle_text }),
    year: inquiry.year,
    // character/timing sind bei einer vollständig übermittelten Anfrage nie
    // null (lib/inquiry/schema.ts verlangt beides), Fallback nur defensiv
    // gegen künftige Datenkorrekturen von Hand.
    character: (inquiry.character as Character | null) ?? "sportlich",
    categories: inquiry.categories as FlowCategory[],
    consulting: inquiry.consulting,
    timing: (inquiry.timing as Timing | null) ?? "flexible",
    hasPricelist: familyRes.data?.has_pricelist ?? false,
    items,
    estimatedTotal: inquiry.estimated_total,
    settings: {
      signatureName: settings.signature_name || "dÄHLer Competition Line AG",
      // Prüfung, Befund 4 (wie lib/inquiry/create.ts): ohne companyName
      // fiel die neu erzeugte Signatur auf companyAddress allein zurück.
      companyName: settings.mail_from_name || "dÄHLer Competition Line AG",
      companyAddress: settings.company_address || "dÄHLer Competition Line AG, Belp",
      signaturePhone: settings.signature_phone || "",
    },
  };

  return buildDraft(draftCtx, (inquiry.locale as Locale) ?? "de");
}

/** Nur für Tests/Scripts: Service-Role-Client, wenn kein Session-Client verfügbar ist. */
export function defaultAdminDb(): Db {
  return createAdminClient();
}
