// Liest public.settings (Key-Value, siehe supabase/seed.sql) über den
// Service-Role-Client. Serverseitig only (lib/supabase/admin.ts wirft im
// Browser). 60s In-Memory-Cache: mehrere Mailversände kurz hintereinander
// (z.B. Bestätigung + Anfrage-Mail bei einer neuen Anfrage) sollen nicht bei
// jedem Versand erneut die DB treffen.
import { createAdminClient } from "@/lib/supabase/admin";

const CACHE_TTL_MS = 60_000;

let cache: { value: Record<string, string>; expiresAt: number } | null = null;

/**
 * Liefert alle Zeilen aus public.settings als Record<key, value>. Ein
 * fehlender Schlüssel ist schlicht nicht im Record enthalten, der Aufrufer
 * entscheidet über Fallbacks (siehe lib/mail/resend.ts).
 */
export async function getSettings(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("settings").select("key, value");

  if (error) {
    throw new Error(`getSettings: settings konnten nicht geladen werden: ${error.message}`);
  }

  const value: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.value !== null) value[row.key] = row.value;
  }

  cache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

/** Nur für Tests: setzt den In-Memory-Cache zurück, damit ein Test die DB frisch liest. */
export function clearSettingsCache(): void {
  cache = null;
}
