"use server";

// Einstellungen speichern (app/admin/einstellungen/page.tsx): alle
// settings-Schlüssel aus docs/db.md, Abschnitt "Tabellen" (mail_from_name,
// mail_from, mail_inbox, mail_bcc, mail_reply_to, signature_name,
// signature_phone, company_address). Schreibt über Postgres (lib/db/client,
// keine RLS mehr, siehe docs/umbau-railway.md), invalidiert danach den
// next/cache-Eintrag für Settings (Tag "settings", siehe
// lib/mail/settings.ts) und den gerenderten Pfad selbst: ohne
// revalidateTag() würde eine geänderte Absenderadresse erst nach bis zu
// 300s in neu verschickten Mails greifen, ohne revalidatePath() zeigt die
// Einstellungen-Seite nach dem Speichern kurzzeitig noch den alten
// RSC-Payload.
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { sql } from "@/lib/db/client";
import { SETTINGS_KEYS } from "@/lib/admin/settings";
import { MAIL_TEXT_KEYS, unknownMailTextPlaceholders } from "@/lib/mail/texts";
import type { ActionResult } from "./inquiries";

export async function saveSettingsAction(values: Record<string, string>): Promise<ActionResult> {
  await requireAdmin();

  // Mailtexte (lib/mail/texts.ts, Rückmeldung dÄHLer 14.10.2026) laufen
  // über dieselbe Tabelle, eigenes Formular (components/admin/MailTextsForm.tsx).
  const allowedKeys: readonly string[] = [...SETTINGS_KEYS, ...MAIL_TEXT_KEYS];
  const rows = allowedKeys.filter((key) => values[key] !== undefined).map((key) => ({
    key,
    value: (values[key] ?? "").replace(/\r\n/g, "\n").trim(),
  }));
  const unknown = [
    ...new Set(
      rows
        .filter((r) => (MAIL_TEXT_KEYS as readonly string[]).includes(r.key))
        .flatMap((r) => unknownMailTextPlaceholders(r.value)),
    ),
  ];
  if (unknown.length > 0) {
    return { ok: false, error: `Unbekannte Platzhalter: ${unknown.join(", ")}. Erlaubt sind {{vorname}}, {{name}}, {{fahrzeug}}, {{jahrgang}}, {{nummer}}.` };
  }
  if (rows.length === 0) {
    return { ok: false, error: "Keine Werte zum Speichern übergeben." };
  }

  try {
    await sql`
      insert into settings ${sql(rows, "key", "value")}
      on conflict (key) do update set value = excluded.value
    `;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }

  revalidateTag("settings");
  revalidatePath("/admin/einstellungen");
  return { ok: true };
}
