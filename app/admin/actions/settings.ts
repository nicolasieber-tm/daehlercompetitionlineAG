"use server";

// Einstellungen speichern (app/admin/einstellungen/page.tsx): alle
// settings-Schlüssel aus docs/architektur.md, Abschnitt "Datenmodell"
// (mail_from_name, mail_from, mail_inbox, mail_bcc, mail_reply_to,
// signature_name, signature_phone, company_address). Schreibt über den
// Session-Client (RLS, Policy settings_all_authenticated), invalidiert
// danach den next/cache-Eintrag für Settings (Tag "settings", siehe
// lib/mail/settings.ts) und den gerenderten Pfad selbst: ohne
// revalidateTag() würde eine geänderte Absenderadresse erst nach bis zu
// 300s in neu verschickten Mails greifen, ohne revalidatePath() zeigt die
// Einstellungen-Seite nach dem Speichern kurzzeitig noch den alten
// RSC-Payload.
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";
import { SETTINGS_KEYS } from "@/lib/admin/settings";
import type { ActionResult } from "./inquiries";

export async function saveSettingsAction(values: Record<string, string>): Promise<ActionResult> {
  await requireAdmin();

  const rows = SETTINGS_KEYS.filter((key) => values[key] !== undefined).map((key) => ({
    key,
    value: (values[key] ?? "").trim(),
  }));
  if (rows.length === 0) {
    return { ok: false, error: "Keine Werte zum Speichern übergeben." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidateTag("settings");
  revalidatePath("/admin/einstellungen");
  return { ok: true };
}
