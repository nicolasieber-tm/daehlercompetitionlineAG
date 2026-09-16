// Admin-Datenzugriff für Anfragen: Übersicht (Filter, Suche, Pagination) und
// Detailansicht (Zusammenfassung, Antwortentwurf, Mail-Protokoll,
// Follow-ups), siehe docs/architektur.md, Abschnitt "Admin".
//
// Postgres direkt über lib/db/client.ts (sql), siehe docs/umbau-railway.md,
// Abschnitt "Datenzugriffsschicht": keine RLS mehr, jeder Zugriff läuft
// ohnehin serverseitig durch die App. getFamilies()/getProductsByIds()
// (lib/catalog/queries.ts), getSettings() (lib/mail/settings.ts) und
// buildMailContext() (lib/inquiry/context.ts) bleiben unverändert
// eingebunden (ausserhalb dieser Aufgabe, siehe Bericht) - ihre Signatur
// bleibt stabil, nur ihre eigene Implementierung wechselt unabhängig davon
// auf Postgres.
import { vehicleLabel } from "@/lib/mail/render";
import { vehicleDisplayLabel } from "@/lib/catalog/vehicle-label";
import { getFamilies } from "@/lib/catalog/queries";
import { getProductsByIds } from "@/lib/catalog/queries";
import { getSettings } from "@/lib/mail/settings";
import { buildMailContext } from "@/lib/inquiry/context";
import { buildDraft } from "@/lib/draft/template";
import type { DraftContext, DraftItem } from "@/lib/draft/template";
import { sql } from "@/lib/db/client";
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
} from "@/lib/db/rows";
import type { MailInquiryContext } from "@/lib/mail/types";

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
// listInquiries() fängt das unten selbst ab (fällt auf Seite 1 zurück).
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
 * alten UTC-Grenzen aber nicht gefunden.
 */
function zurichDayBoundsUtc(dateStr: string): { startUtc: Date; endUtc: Date } {
  const [year, month, day] = dateStr.split("-").map(Number);
  const offsetMs = zurichOffsetMs(Date.UTC(year, month - 1, day, 0, 0, 0));
  const startUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
  const endUtc = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs);
  return { startUtc, endUtc };
}

interface InquiryListDbRow {
  id: string;
  number: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  email: string | null;
  vehicle_text: string | null;
  categories: string[];
  consulting: boolean;
  estimated_total: number | null;
  status: string;
  source: InquirySource;
  family_brand: string | null;
  family_name: string | null;
  family_codes: string[] | null;
  family_has_pricelist: boolean | null;
  model_name: string | null;
}

/**
 * Anfragen für die Übersicht: gefiltert, durchsucht, sortiert (neu zuerst),
 * paginiert (50 pro Seite, siehe INQUIRY_PAGE_SIZE). family/model werden nur
 * mit den für vehicleLabel() nötigen Feldern geladen (siehe
 * lib/mail/render.ts / lib/catalog/vehicle-label.ts).
 */
export async function listInquiries(filters: InquiryListFilters): Promise<InquiryListResult> {
  const pageSize = INQUIRY_PAGE_SIZE;
  let page = Math.max(1, Math.floor(filters.page ?? 1));

  const statusFilter = filters.status && filters.status !== "alle" ? filters.status : null;
  const familyIdFilter = filters.familyId ?? null;
  const fromBound = filters.dateFrom ? zurichDayBoundsUtc(filters.dateFrom).startUtc : null;
  const toBound = filters.dateTo ? zurichDayBoundsUtc(filters.dateTo).endUtc : null;
  const searchTerm = filters.search?.trim();
  const searchPattern = searchTerm ? `%${searchTerm}%` : null;

  async function query(currentPage: number) {
    const offset = (currentPage - 1) * pageSize;
    const rows = await sql<InquiryListDbRow[]>`
      select
        i.id, i.number, i.created_at, i.first_name, i.last_name, i.city, i.email, i.vehicle_text,
        i.categories, i.consulting, i.estimated_total, i.status, i.source,
        f.brand as family_brand, f.name as family_name, f.codes as family_codes, f.has_pricelist as family_has_pricelist,
        m.name as model_name
      from inquiries i
      left join model_families f on f.id = i.family_id
      left join models m on m.id = i.model_id
      where (${statusFilter}::text is null or i.status = ${statusFilter})
        and (${familyIdFilter}::uuid is null or i.family_id = ${familyIdFilter})
        and (${fromBound}::timestamptz is null or i.created_at >= ${fromBound})
        and (${toBound}::timestamptz is null or i.created_at <= ${toBound})
        and (
          ${searchPattern}::text is null
          or i.number ilike ${searchPattern}
          or i.first_name ilike ${searchPattern}
          or i.last_name ilike ${searchPattern}
          or i.email ilike ${searchPattern}
          or i.city ilike ${searchPattern}
        )
      order by i.created_at desc
      limit ${pageSize} offset ${offset}
    `;
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count
      from inquiries i
      where (${statusFilter}::text is null or i.status = ${statusFilter})
        and (${familyIdFilter}::uuid is null or i.family_id = ${familyIdFilter})
        and (${fromBound}::timestamptz is null or i.created_at >= ${fromBound})
        and (${toBound}::timestamptz is null or i.created_at <= ${toBound})
        and (
          ${searchPattern}::text is null
          or i.number ilike ${searchPattern}
          or i.first_name ilike ${searchPattern}
          or i.last_name ilike ${searchPattern}
          or i.email ilike ${searchPattern}
          or i.city ilike ${searchPattern}
        )
    `;
    return { rows, total: count };
  }

  let { rows, total } = await query(page);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (rows.length === 0 && page > 1 && page > pageCount) {
    // Angeforderte Seite liegt jenseits der vorhandenen Zeilen (z.B. Filter
    // seitdem verschärft, oder eine von Hand eingegebene URL): auf Seite 1
    // zurückfallen statt der Nutzerin eine leere Seite zu zeigen (siehe
    // ehemals PostgREST-Fehler PGRST103/HTTP 416, jetzt schlicht eine
    // zweite Abfrage mit page=1).
    page = 1;
    ({ rows, total } = await query(page));
  }

  const mapped: InquiryListRow[] = rows.map((row) => ({
    id: row.id,
    number: row.number,
    createdAt: row.created_at,
    customerName: [row.first_name, row.last_name].filter(Boolean).join(" "),
    city: row.city,
    email: row.email,
    // vehicleDisplayLabel() (statt der lib/mail/render.ts-Fassung, die die
    // vollständigen Row-Typen ModelFamily/Model verlangt) braucht nur
    // brand/name/codes/has_pricelist bzw. name - genau das, was diese
    // Übersichtsabfrage per JOIN mitlädt, ohne die übrigen Katalogspalten
    // extra nachzuladen.
    vehicleLabel: vehicleDisplayLabel(
      row.family_brand !== null
        ? {
            brand: row.family_brand,
            name: row.family_name ?? "",
            codes: row.family_codes ?? [],
            has_pricelist: row.family_has_pricelist ?? true,
          }
        : null,
      row.model_name !== null ? { name: row.model_name } : null,
      row.vehicle_text,
    ),
    categories: row.categories as FlowCategory[],
    consulting: row.consulting,
    estimatedTotal: row.estimated_total,
    status: row.status as InquiryStatus,
    source: row.source as InquirySource,
  }));

  return { rows: mapped, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Anzahl Anfragen mit Status "neu", für den Menü-Zähler (components/admin Sidebar). */
export async function getNewInquiriesCount(): Promise<number> {
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from inquiries where status = 'neu'
  `;
  return count;
}

export interface FamilyFilterOption {
  id: string;
  label: string;
}

/** Baureihen für den Filter-Select, reiht wie getFamilies() (Marke, dann sort/Name). */
export async function getFamilyFilterOptions(): Promise<FamilyFilterOption[]> {
  const families = await getFamilies();
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
 * laufen. Lädt zusätzlich Mail-Protokoll und Follow-ups dieser Anfrage
 * direkt über sql (eigene, admin-spezifische Abfragen).
 */
export async function getInquiryDetail(id: string): Promise<InquiryDetail | null> {
  const [exists] = await sql<{ id: string }[]>`select id from inquiries where id = ${id}`;
  if (!exists) return null;

  const [ctx, outboundEmails, followUpRows] = await Promise.all([
    buildMailContext(id),
    sql<OutboundEmail[]>`
      select * from outbound_emails where inquiry_id = ${id} order by created_at desc
    `,
    sql<(FollowUp & { rule_name: string | null; rule_subject: string | null })[]>`
      select fu.*, r.name as rule_name, r.subject as rule_subject
      from follow_ups fu
      left join follow_up_rules r on r.id = fu.rule_id
      where fu.inquiry_id = ${id}
      order by fu.scheduled_for asc
    `,
  ]);

  const followUps: InquiryFollowUp[] = followUpRows.map((f) => ({
    ...f,
    ruleName: f.rule_name,
    ruleSubject: f.rule_subject,
  }));

  return { ctx, outboundEmails, followUps };
}

// ---------------------------------------------------------------------------
// Mutationen (von app/admin/actions/inquiries.ts nach requireAdmin() aufgerufen)
// ---------------------------------------------------------------------------

export async function setInquiryStatus(id: string, status: InquiryStatus): Promise<void> {
  await sql`update inquiries set status = ${status} where id = ${id}`;
}

export async function saveDraft(id: string, subject: string, body: string): Promise<void> {
  await sql`update inquiries set draft_subject = ${subject}, draft_reply = ${body} where id = ${id}`;
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
 * eigener, expliziter Schritt.
 */
export async function regenerateDraft(id: string): Promise<{ subject: string; body: string }> {
  const [inquiry] = await sql<Inquiry[]>`select * from inquiries where id = ${id}`;
  if (!inquiry) throw new Error(`regenerateDraft: Anfrage ${id} nicht gefunden.`);

  const [familyRows, modelRows, settings] = await Promise.all([
    inquiry.family_id
      ? sql<ModelFamily[]>`select * from model_families where id = ${inquiry.family_id}`
      : Promise.resolve([] as ModelFamily[]),
    inquiry.model_id
      ? sql<Model[]>`select * from models where id = ${inquiry.model_id}`
      : Promise.resolve([] as Model[]),
    getSettings(),
  ]);
  const family = familyRows[0] ?? null;
  const model = modelRows[0] ?? null;

  const stored = parseStoredSelections(inquiry.selections);
  const productIds = stored.map((s) => s.product_id).filter((v): v is string => !!v);
  const products = productIds.length > 0 ? await getProductsByIds(productIds) : [];
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
    vehicleLabel: vehicleLabel({ family, model, vehicleText: inquiry.vehicle_text }),
    year: inquiry.year,
    // character/timing sind bei einer vollständig übermittelten Anfrage nie
    // null (lib/inquiry/schema.ts verlangt beides), Fallback nur defensiv
    // gegen künftige Datenkorrekturen von Hand.
    character: (inquiry.character as Character | null) ?? "sportlich",
    categories: inquiry.categories as FlowCategory[],
    consulting: inquiry.consulting,
    timing: (inquiry.timing as Timing | null) ?? "flexible",
    hasPricelist: family?.has_pricelist ?? false,
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
