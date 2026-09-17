// Admin-Datenzugriff für Follow-up-Regeln und die Liste anstehender
// Follow-ups (Posten 6). Siehe CLAUDE.md, Abschnitt "Follow-ups (Posten 6)",
// docs/architektur.md, und lib/followups/placeholders.ts (renderTemplate,
// reine Funktion ohne DB-Zugriff), das hier wiederverwendet wird.
//
// Postgres direkt über lib/db/client.ts (sql), siehe docs/umbau-railway.md,
// Abschnitt "Datenzugriffsschicht": keine RLS mehr, jeder Zugriff läuft
// ohnehin serverseitig durch die App.
import { sql } from "@/lib/db/client";
import { renderTemplate } from "@/lib/followups/placeholders";
import { vehicleLabel } from "@/lib/mail/render";
import type { Model, ModelFamily } from "@/lib/db/rows";

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
// Bereichs-/Pflichtfeldprüfung (Prüfbefund admin-followups, Punkt 4): weder
// die follow_up_rules-Tabelle (db/migrations/0001_init.sql, nur "not null",
// keine CHECK-Constraints) noch das bisherige UI verhinderten z.B. 0 oder
// 4000 Tage, eine leere maxCount oder leeren Betreff/Text - eine solche
// Regel hätte lib/followups/schedule.ts (Terminberechnung) und
// lib/followups/run.ts (max_count-Vergleich) mit unsinnigen/fehlenden Werten
// erreicht. Wird in createRule()/updateRule() VOR dem Speichern geprüft,
// wie assertKnownPlaceholders() oben.
// ---------------------------------------------------------------------------

export class FollowUpRuleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FollowUpRuleValidationError";
  }
}

function assertValidRuleInput(input: FollowUpRuleInput): void {
  if (!Number.isInteger(input.daysAfterReply) || input.daysAfterReply < 1 || input.daysAfterReply > 365) {
    throw new FollowUpRuleValidationError("Frist muss eine ganze Zahl zwischen 1 und 365 Tagen sein.");
  }
  if (!Number.isInteger(input.maxCount) || input.maxCount < 1 || input.maxCount > 10) {
    throw new FollowUpRuleValidationError("Maximale Anzahl muss eine ganze Zahl zwischen 1 und 10 sein.");
  }
  if (!input.name.trim()) {
    throw new FollowUpRuleValidationError("Name darf nicht leer sein.");
  }
  if (!input.subject.trim()) {
    throw new FollowUpRuleValidationError("Betreff darf nicht leer sein.");
  }
  if (!input.body.trim()) {
    throw new FollowUpRuleValidationError("Text darf nicht leer sein.");
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

interface RuleRow {
  id: string;
  name: string;
  days_after_reply: number;
  subject: string;
  body: string;
  max_count: number;
  active: boolean;
  sort: number;
}

export async function listRules(): Promise<FollowUpRuleRow[]> {
  const rows = await sql<RuleRow[]>`
    select id, name, days_after_reply, subject, body, max_count, active, sort
    from follow_up_rules
    order by sort asc, name asc
  `;
  return rows.map((r) => ({
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

export async function createRule(input: FollowUpRuleInput): Promise<string> {
  assertValidRuleInput(input);
  assertKnownPlaceholders(input.subject, input.body);

  const [row] = await sql<{ id: string }[]>`
    insert into follow_up_rules (name, days_after_reply, subject, body, max_count, active, sort)
    values (${input.name}, ${input.daysAfterReply}, ${input.subject}, ${input.body}, ${input.maxCount}, ${input.active}, ${input.sort})
    returning id
  `;
  return row.id;
}

export async function updateRule(id: string, input: FollowUpRuleInput): Promise<void> {
  assertValidRuleInput(input);
  assertKnownPlaceholders(input.subject, input.body);

  await sql`
    update follow_up_rules
    set name = ${input.name},
        days_after_reply = ${input.daysAfterReply},
        subject = ${input.subject},
        body = ${input.body},
        max_count = ${input.maxCount},
        active = ${input.active},
        sort = ${input.sort}
    where id = ${id}
  `;
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
 * (db/migrations/0001_init.sql), ein Löschen würde also nicht scheitern,
 * aber offene follow_ups verlören ihren Regeltext (siehe lib/followups/
 * run.ts: ohne Regel wird ein Eintrag storniert statt gesendet) -
 * Deaktivieren erhält die Regel für die noch ausstehenden Sendungen.
 */
export async function deleteOrDeactivateRule(id: string): Promise<DeleteRuleResult> {
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count
    from follow_ups
    where rule_id = ${id} and sent_at is null and cancelled_at is null and failed_at is null
  `;

  if (count > 0) {
    await sql`update follow_up_rules set active = false where id = ${id}`;
    return { deleted: false };
  }

  await sql`delete from follow_up_rules where id = ${id}`;
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
  rule_name: string | null;
  number: string;
  first_name: string | null;
  last_name: string | null;
  vehicle_text: string | null;
  line: string | null;
  family: ModelFamily | null;
  model: Model | null;
}

const UPCOMING_WINDOW_DAYS = 30;

export async function listUpcomingFollowUps(windowDays: number = UPCOMING_WINDOW_DAYS): Promise<UpcomingFollowUpRow[]> {
  const until = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000);
  const untilStr = until.toISOString().slice(0, 10);

  const rows = await sql<UpcomingRow[]>`
    select
      fu.id, fu.scheduled_for, fu.inquiry_id,
      r.name as rule_name,
      i.number, i.first_name, i.last_name, i.vehicle_text, i.line,
      case when f.id is null then null else to_jsonb(f.*) end as family,
      case when m.id is null then null else to_jsonb(m.*) end as model
    from follow_ups fu
    join inquiries i on i.id = fu.inquiry_id
    left join follow_up_rules r on r.id = fu.rule_id
    left join model_families f on f.id = i.family_id
    left join models m on m.id = i.model_id
    where fu.scheduled_for <= ${untilStr}
      and fu.sent_at is null
      and fu.cancelled_at is null
      and fu.failed_at is null
    order by fu.scheduled_for asc
  `;

  return rows.map((r) => {
    const customerName = [r.first_name, r.last_name].filter(Boolean).join(" ") || "-";
    return {
      id: r.id,
      scheduledFor: r.scheduled_for,
      inquiryId: r.inquiry_id,
      inquiryNumber: r.number,
      ruleName: r.rule_name,
      customerName,
      vehicleLabel: vehicleLabel({ family: r.family, model: r.model, vehicleText: r.vehicle_text, line: r.line }),
    };
  });
}
