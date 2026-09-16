// Gemeinsame Test-Hilfen für lib/followups (DB-Tests gegen den lokalen
// Postgres, siehe docs/db.md). Absichtlich KEINE *.test.ts Datei (siehe
// vitest.config.ts: include nur "tests/**/*.test.ts" und
// "lib/**/*.test.ts"), wird also selbst nicht als Testsuite ausgeführt.
//
// .env wird bereits global geladen (siehe tests/setup.ts), hier nicht
// nochmals nötig.
import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db/client";
import type { FollowUpRuleInsert, Inquiry, InquiryInsert, FollowUpRule } from "@/lib/db/rows";

export { sql };

/** Legt eine Test-Anfrage mit den Pflichtfeldern an (number-Präfix "TEST-"). */
export async function createTestInquiry(overrides: Partial<InquiryInsert> = {}): Promise<Inquiry> {
  const row: InquiryInsert = {
    number: `TEST-${Date.now()}-${randomUUID().slice(0, 8)}`,
    share_token: randomUUID(),
    first_name: "Nadia",
    last_name: "Testkundin",
    email: "kunde@example.com",
    ...overrides,
  };
  const [inserted] = await sql<Inquiry[]>`insert into inquiries ${sql(row)} returning *`;
  return inserted;
}

/** Legt eine Test-Follow-up-Regel an, Standard: aktiv, 0 Tage nach Antwort, max_count 1. */
export async function createTestRule(overrides: Partial<FollowUpRuleInsert> = {}): Promise<FollowUpRule> {
  const row: FollowUpRuleInsert = {
    name: `TEST-Regel-${randomUUID().slice(0, 8)}`,
    days_after_reply: 0,
    subject: "Test-Follow-up {{nummer}}",
    body: "Guten Tag {{vorname}} {{name}}, betrifft {{fahrzeug}}.",
    max_count: 1,
    active: true,
    ...overrides,
  };
  const [inserted] = await sql<FollowUpRule[]>`insert into follow_up_rules ${sql(row)} returning *`;
  return inserted;
}

/** Löscht alle Testdaten zu einer Anfrage (outbound_emails, follow_ups, inquiries). */
export async function deleteTestInquiry(inquiryId: string): Promise<void> {
  await sql`delete from outbound_emails where inquiry_id = ${inquiryId}`;
  await sql`delete from follow_ups where inquiry_id = ${inquiryId}`;
  await sql`delete from inquiries where id = ${inquiryId}`;
}

/** Löscht eine Test-Regel (und zur Sicherheit noch daran hängende follow_ups). */
export async function deleteTestRule(ruleId: string): Promise<void> {
  await sql`delete from follow_ups where rule_id = ${ruleId}`;
  await sql`delete from follow_up_rules where id = ${ruleId}`;
}
