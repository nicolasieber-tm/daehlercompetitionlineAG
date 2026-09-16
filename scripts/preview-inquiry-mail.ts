#!/usr/bin/env tsx
// Rendert eine Mail zu einer bestehenden Anfrage OHNE Versand (HTML, Text
// und Screenshot bei 375 px) - zum Prüfen der Vorlagen, ohne das Resend-
// Kontingent zu belasten.
//
// Aufruf: npx tsx scripts/preview-inquiry-mail.ts <Nummer> [confirmation|summary|inbox|reply] [Ausgabeordner]
export {};

try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMailContext } from "@/lib/inquiry/context";
import { buildConfirmation, buildSummary, buildInbox, buildReply } from "@/lib/mail";

type MailType = "confirmation" | "summary" | "inbox" | "reply";

async function main() {
  const number = process.argv[2];
  const type = (process.argv[3] || "confirmation") as MailType;
  const outDir = process.argv[4] || path.join(process.cwd(), ".mail-preview");
  if (!number || !["confirmation", "summary", "inbox", "reply"].includes(type)) {
    console.error("Aufruf: npx tsx scripts/preview-inquiry-mail.ts <Nummer> [confirmation|summary|inbox|reply] [Ausgabeordner]");
    process.exit(1);
  }
  const db = createAdminClient();
  const { data: inquiry, error } = await db.from("inquiries").select("id").eq("number", number).maybeSingle();
  if (error) throw error;
  if (!inquiry) {
    console.error(`Anfrage ${number} nicht gefunden.`);
    process.exit(1);
  }
  const ctx = await buildMailContext(inquiry.id, db);
  const builders = { confirmation: buildConfirmation, summary: buildSummary, inbox: buildInbox, reply: buildReply };
  const { subject, html, text } = builders[type](ctx);

  mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${number}-${type}`);
  writeFileSync(`${base}.html`, html);
  writeFileSync(`${base}.txt`, `Betreff: ${subject}\n\n${text}`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await page.setContent(html);
  await page.screenshot({ path: `${base}-375.png`, fullPage: true });
  await browser.close();
  console.log(`Betreff: ${subject}\nDateien: ${base}.html, ${base}.txt, ${base}-375.png`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
