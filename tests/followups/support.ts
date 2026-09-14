// Gemeinsame Test-Hilfen für lib/followups (DB-Tests gegen die lokale
// Supabase-Instanz, siehe docs/db.md). Absichtlich KEINE *.test.ts Datei
// (siehe vitest.config.ts: include nur "tests/**/*.test.ts" und
// "lib/**/*.test.ts"), wird also selbst nicht als Testsuite ausgeführt.
//
// .env selbst laden wie scripts/create-admin-users.ts (Node 24, kein
// dotenv-Paket in der freigegebenen Paketliste): vitest lädt .env nicht
// automatisch in process.env.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FollowUpRuleInsert, Inquiry, InquiryInsert, FollowUpRule } from "@/lib/supabase/rows";

export const admin = createAdminClient();

/** Legt eine Test-Anfrage mit den Pflichtfeldern an (number-Präfix "TEST-"). */
export async function createTestInquiry(overrides: Partial<InquiryInsert> = {}): Promise<Inquiry> {
  const { data, error } = await admin
    .from("inquiries")
    .insert({
      number: `TEST-${Date.now()}-${randomUUID().slice(0, 8)}`,
      share_token: randomUUID(),
      first_name: "Nadia",
      last_name: "Testkundin",
      email: "kunde@example.com",
      ...overrides,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Legt eine Test-Follow-up-Regel an, Standard: aktiv, 0 Tage nach Antwort, max_count 1. */
export async function createTestRule(overrides: Partial<FollowUpRuleInsert> = {}): Promise<FollowUpRule> {
  const { data, error } = await admin
    .from("follow_up_rules")
    .insert({
      name: `TEST-Regel-${randomUUID().slice(0, 8)}`,
      days_after_reply: 0,
      subject: "Test-Follow-up {{nummer}}",
      body: "Guten Tag {{vorname}} {{name}}, betrifft {{fahrzeug}}.",
      max_count: 1,
      active: true,
      ...overrides,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Löscht alle Testdaten zu einer Anfrage (outbound_emails, follow_ups, inquiries). */
export async function deleteTestInquiry(inquiryId: string): Promise<void> {
  await admin.from("outbound_emails").delete().eq("inquiry_id", inquiryId);
  await admin.from("follow_ups").delete().eq("inquiry_id", inquiryId);
  await admin.from("inquiries").delete().eq("id", inquiryId);
}

/** Löscht eine Test-Regel (und zur Sicherheit noch daran hängende follow_ups). */
export async function deleteTestRule(ruleId: string): Promise<void> {
  await admin.from("follow_ups").delete().eq("rule_id", ruleId);
  await admin.from("follow_up_rules").delete().eq("id", ruleId);
}
