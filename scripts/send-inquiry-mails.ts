#!/usr/bin/env tsx
// Sendet die Mails zu einer bestehenden Anfrage erneut (Bestätigung an den
// Kunden, Zusammenfassung an den Kunden, interne Anfrage-Mail an den
// Posteingang). Gedacht für Tests und für den Fall, dass der Versand beim
// Anlegen fehlgeschlagen ist (z. B. Resend-Fehler); jeder Versand wird wie
// gewohnt in outbound_emails protokolliert.
//
// Aufruf: npx tsx scripts/send-inquiry-mails.ts <Nummer, z. B. 2026-0272> [confirmation,summary,inbox]
// MAIL_TO_OVERRIDE und RESEND_FROM_OVERRIDE aus .env oder der Umgebung gelten.
export {};

try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { createAdminClient } from "@/lib/supabase/admin";
import { buildMailContext } from "@/lib/inquiry/context";
import { sendInquiryMail } from "@/lib/mail";

type MailType = "confirmation" | "summary" | "inbox";

async function main() {
  const number = process.argv[2];
  const types = (process.argv[3] || "confirmation,summary,inbox")
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is MailType => t === "confirmation" || t === "summary" || t === "inbox");
  if (!number || types.length === 0) {
    console.error("Aufruf: npx tsx scripts/send-inquiry-mails.ts <Nummer> [confirmation,summary,inbox]");
    process.exit(1);
  }

  const db = createAdminClient();
  const { data: inquiry, error } = await db.from("inquiries").select("id, email").eq("number", number).maybeSingle();
  if (error) throw error;
  if (!inquiry) {
    console.error(`Anfrage ${number} nicht gefunden.`);
    process.exit(1);
  }

  console.log(
    `Anfrage ${number}: Kunde ${inquiry.email ?? "(keine E-Mail)"}` +
      (process.env.MAIL_TO_OVERRIDE ? ` · Testmodus, alle Mails an ${process.env.MAIL_TO_OVERRIDE}` : "") +
      (process.env.RESEND_FROM_OVERRIDE ? ` · Absender ${process.env.RESEND_FROM_OVERRIDE}` : ""),
  );

  const ctx = await buildMailContext(inquiry.id, db);
  let failed = 0;
  for (const type of types) {
    const result = await sendInquiryMail(type, ctx);
    if (result.ok) {
      console.log(`  ${type.padEnd(12)} gesendet · resendId ${result.resendId}`);
    } else {
      failed++;
      console.log(`  ${type.padEnd(12)} FEHLER · ${result.error}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
