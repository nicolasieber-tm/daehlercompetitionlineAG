#!/usr/bin/env tsx
// Sendet die Mails zu einer bestehenden Anfrage erneut (Bestätigung an den
// Kunden, interne Anfrage-Mail an den Posteingang). Gedacht für Tests und
// für den Fall, dass der Versand beim Anlegen fehlgeschlagen ist (z. B.
// Resend-Fehler); jeder Versand wird wie gewohnt in outbound_emails
// protokolliert.
//
// Aufruf: npx tsx scripts/send-inquiry-mails.ts <Nummer, z. B. 2026-0272> [confirmation,inbox]
// MAIL_TO_OVERRIDE und RESEND_FROM_OVERRIDE aus .env oder der Umgebung gelten.
export {};

try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

type MailType = "confirmation" | "inbox";

async function main() {
  // Dynamischer Import, NACH process.loadEnvFile(): ein statischer
  // `import { sql } from "@/lib/db/client"` (oder ein Modul, das es
  // transitiv importiert, wie lib/inquiry/context.ts/lib/mail) würde von
  // esbuild/tsx an den Dateianfang gehoben (CJS-Emit hoisted alle Imports,
  // empirisch geprüft) - DATABASE_URL wäre beim Erzeugen des Pools dann noch
  // nicht gesetzt.
  const { sql, closeDb } = await import("@/lib/db/client");
  const { buildMailContext } = await import("@/lib/inquiry/context");
  const { sendInquiryMail } = await import("@/lib/mail");

  const number = process.argv[2];
  const types = (process.argv[3] || "confirmation,inbox")
    .split(",")
    .map((t) => t.trim())
    .filter((t): t is MailType => t === "confirmation" || t === "inbox");
  if (!number || types.length === 0) {
    console.error("Aufruf: npx tsx scripts/send-inquiry-mails.ts <Nummer> [confirmation,inbox]");
    process.exit(1);
  }

  const [inquiry] = await sql<{ id: string; email: string | null }[]>`
    select id, email from inquiries where number = ${number}
  `;
  if (!inquiry) {
    console.error(`Anfrage ${number} nicht gefunden.`);
    process.exit(1);
  }

  console.log(
    `Anfrage ${number}: Kunde ${inquiry.email ?? "(keine E-Mail)"}` +
      (process.env.MAIL_TO_OVERRIDE ? ` · Testmodus, alle Mails an ${process.env.MAIL_TO_OVERRIDE}` : "") +
      (process.env.RESEND_FROM_OVERRIDE ? ` · Absender ${process.env.RESEND_FROM_OVERRIDE}` : ""),
  );

  const ctx = await buildMailContext(inquiry.id);
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
  await closeDb();
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
