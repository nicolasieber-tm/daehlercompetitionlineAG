#!/usr/bin/env tsx
// Echter Testversand für lib/mail: baut die confirmation-Vorlage mit einem
// Fixture-Kontext und schickt sie über sendMail() tatsächlich an
// MAIL_TO_OVERRIDE. Absender ist RESEND_FROM_OVERRIDE, falls gesetzt, sonst
// onboarding@resend.dev (solange die Domain daehler.com bei Resend nicht
// verifiziert ist, siehe .env.example).
//
// Aufruf: npm run mail:test
export {}; // macht die Datei zu einem Modul (isolierter Scope)

// .env selbst laden (Node 24, kein dotenv-Paket in der freigegebenen
// Paketliste), wie scripts/create-admin-users.ts.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

// Solange daehler.com bei Resend nicht verifiziert ist, käme jeder Versand
// mit settings.mail_from (anfrage@daehler.com) als "invalid_from_address"
// zurück. Ohne explizit gesetztes RESEND_FROM_OVERRIDE also den
// Resend-Testkonto-Standard verwenden.
if (!process.env.RESEND_FROM_OVERRIDE) {
  process.env.RESEND_FROM_OVERRIDE = "onboarding@resend.dev";
}

import { buildConfirmation } from "@/lib/mail/templates/confirmation";
import { sendMail } from "@/lib/mail/resend";
import type { MailInquiryContext } from "@/lib/mail/types";

// Sicherheitsnetz: dieses Skript ist ausdrücklich ein Testversand (siehe
// CLAUDE.md, MAIL_TO_OVERRIDE: "Test: alle Mails hierhin"). Ohne gesetztes
// MAIL_TO_OVERRIDE würde sendMail() an die Fixture-Adresse unten senden,
// das darf hier nicht versehentlich passieren.
if (!process.env.MAIL_TO_OVERRIDE) {
  console.error(
    "scripts/mail-test.ts: MAIL_TO_OVERRIDE ist nicht gesetzt. Abbruch, kein Versand " +
      "(siehe .env.example). Zum echten Testversand MAIL_TO_OVERRIDE in .env setzen.",
  );
  process.exit(1);
}

const ctx: MailInquiryContext = {
  inquiry: {
    ai_extraction: null,
    answer_received_at: null,
    been_here: true,
    categories: ["motor", "auspuff"],
    channel: "email",
    character: "sportlich",
    checks: [],
    city: "Belp",
    consulting: false,
    created_at: new Date().toISOString(),
    draft_reply: null,
    draft_subject: null,
    email: "fixture-kunde@example.com",
    estimated_total: 8360,
    family_id: "00000000-0000-0000-0000-000000000001",
    first_name: "Nadia",
    follow_up_answers: { motor: "beides", auspuff: "kraeftig" },
    id: "00000000-0000-0000-0000-000000000002",
    last_name: "Muster",
    locale: "de",
    message: "Testversand über scripts/mail-test.ts, kein echter Kunde.",
    model_id: "00000000-0000-0000-0000-000000000003",
    number: "2026-TEST",
    phone: "+41 79 000 00 00",
    raw_text: null,
    replied_at: null,
    selections: [],
    share_token: "mail-test-fixture-share-token",
    source: "web",
    status: "neu",
    timing: "m1_2",
    updated_at: new Date().toISOString(),
    vehicle_text: null,
    year: "2024",
  },
  family: {
    active: true,
    brand: "BMW",
    codes: ["G81"],
    created_at: new Date().toISOString(),
    has_pricelist: true,
    id: "00000000-0000-0000-0000-000000000001",
    name: "3er G20, G21",
    photo_url: null,
    pricelist_no: "46259",
    short_text: null,
    slug: "bmw-3er-g20-g21",
    sort: 0,
    source_file: "3er.xlsx",
    updated_at: new Date().toISOString(),
  },
  model: {
    active: true,
    created_at: new Date().toISOString(),
    family_id: "00000000-0000-0000-0000-000000000001",
    fuel: "benzin",
    id: "00000000-0000-0000-0000-000000000003",
    name: "M3 Touring",
    photo_url: null,
    series_nm: 650,
    series_ps: 510,
    series_ps_suggested: [510],
    slug: "m3-touring",
    sort: 0,
    updated_at: new Date().toISOString(),
  },
  items: [
    { category: "motor", name: "Stufe 1", description: "620 PS / 740 Nm", price_total: 4180, price_status: "priced" },
    { category: "auspuff", name: "Klappenauspuffanlage", description: null, price_total: 4180, price_status: "priced" },
  ],
  estimatedTotal: 8360,
  checks: [{ id: "motor_auspuff_compat", text: "Kompatibilität Abgasanlage und Motorsoftware prüfen." }],
  draft: {
    subject: "Ihre Anfrage für den BMW M3 Touring, Nr. 2026-TEST",
    body: "Guten Tag Nadia Muster\n\nDies ist ein Testversand von scripts/mail-test.ts.\n\nSportliche Grüsse aus Belp",
  },
  locale: "de",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  shareUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/p/mail-test-fixture-share-token`,
  adminUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/admin/anfragen/00000000-0000-0000-0000-000000000002`,
};

async function main() {
  const { subject, html, text } = buildConfirmation(ctx);

  console.log(`Sende confirmation an MAIL_TO_OVERRIDE (${process.env.MAIL_TO_OVERRIDE})...`);
  console.log(`Absender: ${process.env.RESEND_FROM_OVERRIDE}`);

  const result = await sendMail({
    to: ctx.inquiry.email!,
    subject,
    html,
    text,
    type: "confirmation",
    inquiryId: null, // Fixture, keine echte Anfrage: keine outbound_emails-Zeile.
    locale: ctx.locale,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error(`Testversand fehlgeschlagen: ${result.error}`);
    process.exitCode = 1;
  } else {
    console.log(`Testversand erfolgreich, resendId=${result.resendId}`);
  }
}

main();
