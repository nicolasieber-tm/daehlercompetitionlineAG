// Gemeinsame Test-Hilfen für DB-Tests gegen den lokalen Postgres (siehe
// docs/db.md, docs/umbau-railway.md), analog zu tests/followups/support.ts,
// beide auf lib/db/client. Absichtlich KEINE *.test.ts-Datei (siehe
// vitest.config.ts: include nur "tests/**/*.test.ts" und
// "lib/**/*.test.ts"), wird also selbst nicht als Testsuite ausgeführt.
//
// .env wird bereits global geladen (siehe tests/setup.ts), hier nicht
// nochmals nötig.
import { sql } from "@/lib/db/client";

export { sql };

/** Löscht alle Anfragen, deren E-Mail-Adresse auf `suffix` endet, inklusive
 * abhängiger outbound_emails und follow_ups (beide "on delete cascade" auf
 * inquiries, siehe db/migrations/0001_init.sql). Für Tests, die eine
 * eindeutige Test-Adresse verwenden (z.B. `${randomUUID()}@example.com`). */
export async function deleteInquiriesByEmailSuffix(suffix: string): Promise<void> {
  await sql`delete from inquiries where email like ${"%" + suffix}`;
}

/** Löscht alle Anfragen, deren number mit `prefix` beginnt (Konvention aus
 * bestehenden Tests: number wie "TEST-<timestamp>-<random>"), inklusive
 * abhängiger outbound_emails und follow_ups. */
export async function deleteInquiriesByNumberPrefix(prefix: string): Promise<void> {
  await sql`delete from inquiries where number like ${prefix + "%"}`;
}

/** Löscht alle Follow-up-Regeln, deren name mit `prefix` beginnt. Löscht
 * zuerst daran hängende follow_ups (rule_id steht bei follow_up_rules auf
 * "on delete set null", nicht cascade: ohne diesen Schritt blieben
 * verwaiste, aber sonst gültige follow_ups-Zeilen zurück). */
export async function deleteFollowUpRulesByNamePrefix(prefix: string): Promise<void> {
  const rules = await sql<{ id: string }[]>`
    select id from follow_up_rules where name like ${prefix + "%"}
  `;
  const ruleIds = rules.map((rule) => rule.id);

  if (ruleIds.length > 0) {
    await sql`delete from follow_ups where rule_id in ${sql(ruleIds)}`;
  }

  await sql`delete from follow_up_rules where name like ${prefix + "%"}`;
}
