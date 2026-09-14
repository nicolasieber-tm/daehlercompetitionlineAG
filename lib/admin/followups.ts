// Admin-Datenzugriff für Follow-up-Regeln und die Liste anstehender
// Follow-ups (Posten 6). Siehe CLAUDE.md, Abschnitt "Follow-ups (Posten 6)",
// docs/architektur.md, und lib/followups/{placeholders,schedule,run}.ts, die
// hier wiederverwendet werden (kein eigener Platzhalter-/Planungscode).
//
// Wie lib/admin/inquiries.ts: liest/schreibt über den Server-Client
// (Session-Cookies, RLS) - `follow_up_rules_all_authenticated` und
// `follow_ups_all_authenticated` (siehe supabase/migrations/
// 20260911000000_init.sql) geben jedem eingeloggten Admin volle Rechte.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { renderTemplate } from "@/lib/followups/placeholders";
import { vehicleLabel } from "@/lib/mail/render";
import type { Model, ModelFamily } from "@/lib/supabase/rows";

type Db = SupabaseClient<Database>;

async function resolveClient(db?: Db): Promise<Db> {
  return db ?? (await createServerClient());
}

// ---------------------------------------------------------------------------
// Platzhalter-Validierung (siehe lib/followups/placeholders.ts): unbekannte
// Platzhalter in Betreff ODER Text blockieren das Speichern (Aufgaben-
// stellung "Validierung über renderTemplate ... unbekannte Platzhalter
// blockieren das Speichern").
// ---------------------------------------------------------------------------

export class UnknownPlaceholderError extends Error {
  constructor(public readonly placeholders: string[]) {
    super(`Unbekannte Platzhalter: ${placeholders.join(", ")}`);
    this.name = "UnknownPlaceholderError";
  }
}

function assertKnownPlaceholders(subject: string, body: string): void {
  const subjectResult = renderTemplate(subject, {});
  const bodyResult = renderTemplate(body, {});
  const unknown = [...new Set([...subjectResult.unknownPlaceholders, ...bodyResult.unknownPlaceholders])];
  if (unknown.length > 0) {
    throw new UnknownPlaceholderError(unknown);
  }
}

// ---------------------------------------------------------------------------
// Regeln
// ---------------------------------------------------------------------------

export interface FollowUpRuleRow {
  id: string;
  name: string;
  daysAfterReply: number;
  subject: string;
  body: string;
  maxCount: number;
  active: boolean;
  sort: number;
}

export async function listRules(db?: Db): Promise<FollowUpRuleRow[]> {
  const client = await resolveClient(db);
  const { data, error } = await client
    .from("follow_up_rules")
    .select("id, name, days_after_reply, subject, body, max_count, active, sort")
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Follow-up-Regeln laden fehlgeschlagen: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    daysAfterReply: r.days_after_reply,
    subject: r.subject,
    body: r.body,
    maxCount: r.max_count,
    active: r.active,
    sort: r.sort,
  }));
}

export interface FollowUpRuleInput {
  name: string;
  daysAfterReply: number;
  subject: string;
  body: string;
  maxCount: number;
  active: boolean;
  sort: number;
}

export async function createRule(input: FollowUpRuleInput, db?: Db): Promise<string> {
  assertKnownPlaceholders(input.subject, input.body);
  const client = await resolveClient(db);
  const { data, error } = await client
    .from("follow_up_rules")
    .insert({
      name: input.name,
      days_after_reply: input.daysAfterReply,
      subject: input.subject,
      body: input.body,
      max_count: input.maxCount,
      active: input.active,
      sort: input.sort,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Follow-up-Regel anlegen fehlgeschlagen: ${error.message}`);
  return data.id;
}

export async function updateRule(id: string, input: FollowUpRuleInput, db?: Db): Promise<void> {
  assertKnownPlaceholders(input.subject, input.body);
  const client = await resolveClient(db);
  const { error } = await client
    .from("follow_up_rules")
    .update({
      name: input.name,
      days_after_reply: input.daysAfterReply,
      subject: input.subject,
      body: input.body,
      max_count: input.maxCount,
      active: input.active,
      sort: input.sort,
    })
    .eq("id", id);
  if (error) throw new Error(`Follow-up-Regel speichern fehlgeschlagen: ${error.message}`);
}

export interface DeleteRuleResult {
  deleted: boolean;
}

/**
 * Löscht eine Regel, ausser es bestehen noch offene follow_ups-Einträge
 * dafür (sent_at, cancelled_at, failed_at alle null - "offen" wie in
 * lib/followups/run.ts/schedule.ts): dann wird sie stattdessen deaktiviert
 * (Aufgabenstellung "löschen nur ohne offene follow_ups, sonst
 * deaktivieren"). follow_ups.rule_id ist ohnehin "on delete set null"
 * (Migration), ein Löschen würde also nicht scheitern, aber offene
 * follow_ups verlören ihren Regeltext (siehe lib/followups/run.ts: ohne
 * Regel wird ein Eintrag storniert statt gesendet) - Deaktivieren erhält die
 * Regel für die noch ausstehenden Sendungen.
 */
export async function deleteOrDeactivateRule(id: string, db?: Db): Promise<DeleteRuleResult> {
  const client = await resolveClient(db);

  const { count, error: countError } = await client
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("rule_id", id)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .is("failed_at", null);
  if (countError) throw new Error(`Offene Follow-ups prüfen fehlgeschlagen: ${countError.message}`);

  if ((count ?? 0) > 0) {
    const { error } = await client.from("follow_up_rules").update({ active: false }).eq("id", id);
    if (error) throw new Error(`Follow-up-Regel deaktivieren fehlgeschlagen: ${error.message}`);
    return { deleted: false };
  }

  const { error } = await client.from("follow_up_rules").delete().eq("id", id);
  if (error) throw new Error(`Follow-up-Regel löschen fehlgeschlagen: ${error.message}`);
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Anstehende Follow-ups (30 Tage)
// ---------------------------------------------------------------------------

export interface UpcomingFollowUpRow {
  id: string;
  scheduledFor: string;
  inquiryId: string;
  inquiryNumber: string;
  ruleName: string | null;
  customerName: string;
  vehicleLabel: string;
}

interface UpcomingRow {
  id: string;
  scheduled_for: string;
  inquiry_id: string;
  follow_up_rules: { name: string } | null;
  inquiries: {
    number: string;
    first_name: string | null;
    last_name: string | null;
    vehicle_text: string | null;
    model_families: Pick<ModelFamily, "brand" | "name" | "codes"> | null;
    models: Pick<Model, "name"> | null;
  } | null;
}

const UPCOMING_WINDOW_DAYS = 30;

export async function listUpcomingFollowUps(windowDays: number = UPCOMING_WINDOW_DAYS, db?: Db): Promise<UpcomingFollowUpRow[]> {
  const client = await resolveClient(db);
  const today = new Date();
  const until = new Date(today.getTime() + windowDays * 24 * 60 * 60 * 1000);
  const untilStr = until.toISOString().slice(0, 10);

  const { data, error } = await client
    .from("follow_ups")
    .select(
      "id, scheduled_for, inquiry_id, " +
        "follow_up_rules(name), " +
        "inquiries(number, first_name, last_name, vehicle_text, model_families(brand, name, codes), models(name))",
    )
    .lte("scheduled_for", untilStr)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .is("failed_at", null)
    .order("scheduled_for", { ascending: true });
  if (error) throw new Error(`Anstehende Follow-ups laden fehlgeschlagen: ${error.message}`);

  const rows = (data ?? []) as unknown as UpcomingRow[];
  return rows
    .filter((r) => r.inquiries !== null)
    .map((r) => {
      const inquiry = r.inquiries!;
      const customerName = [inquiry.first_name, inquiry.last_name].filter(Boolean).join(" ") || "-";
      return {
        id: r.id,
        scheduledFor: r.scheduled_for,
        inquiryId: r.inquiry_id,
        inquiryNumber: inquiry.number,
        ruleName: r.follow_up_rules?.name ?? null,
        customerName,
        vehicleLabel: vehicleLabel({
          family: inquiry.model_families as ModelFamily | null,
          model: inquiry.models as Model | null,
          vehicleText: inquiry.vehicle_text,
        }),
      };
    });
}
