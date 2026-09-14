// Liest public.settings (Key-Value, siehe supabase/seed.sql) über den
// Service-Role-Client. Serverseitig only (lib/supabase/admin.ts wirft im
// Browser).
//
// Cache: next/cache unstable_cache mit Tag "settings" (revalidate 300s)
// hält den DB-Stand über mehrere Requests hinweg vor. Der Next Data Cache
// lebt ausserhalb jeder Modul-Instanz (im Next-Server-Prozess selbst
// verwaltet, nicht in einer JS-Variable dieses Moduls) - revalidateTag
// ("settings") in app/admin/actions/settings.ts invalidiert ihn nach dem
// Speichern zuverlässig, unabhängig davon, aus welchem Webpack-Chunk der
// Aufruf kommt. React cache() aussenherum dedupliziert zusätzlich mehrere
// getSettings()-Aufrufe innerhalb desselben Requests (z.B. Layout + Page)
// auf einen synchronen Aufruf.
//
// Prüfbefund (admin-shell, Punkt 1): der vorherige Ansatz war ein
// modul-lokaler In-Memory-Cache (ein `let`, zuletzt als globalThis-
// Singleton). Next.js bündelt Server Actions (z.B. app/admin/actions/
// settings.ts) und normale RSC-Importe (z.B. app/admin/einstellungen/
// page.tsx) im Prod-Build in getrennte Webpack-Chunks - ein modullokaler
// Cache kann dadurch zweimal instanziiert werden, ein clearSettingsCache()-
// Aufruf aus der einen Instanz leert dann die andere nicht, die geänderte
// Einstellung erscheint bis zu einer Minute lang nicht. Der globalThis-
// Umweg wäre zwar ein Fix dafür gewesen, ersetzt hier aber komplett durch
// next/cache, den ohnehin vorhandenen, offiziellen Next-Mechanismus für
// genau diesen Fall (Cache + gezielte Invalidierung per Tag).
//
// next/cache funktioniert nur innerhalb eines laufenden Next.js-Servers
// (Server Components, Route Handler, Server Actions): ausserhalb (Skripte
// unter scripts/, Tests via vitest) importiert sich "next/cache" zwar
// klaglos, aber der *Aufruf* von unstable_cache()/revalidateTag() wirft dort
// ("Invariant: incrementalCache missing" bzw. "Invariant: static generation
// store missing") - deshalb liegt der try/catch unten um den Aufruf, nicht
// um den (unkritischen) Import; siehe auch lib/catalog/queries.ts, das aus
// demselben Grund ganz auf next/cache verzichtet und stattdessen jedem
// Aufrufer einen eigenen Client übergeben lässt.
import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

async function fetchSettingsFromDb(): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("settings").select("key, value");

  if (error) {
    throw new Error(`getSettings: settings konnten nicht geladen werden: ${error.message}`);
  }

  const value: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.value !== null) value[row.key] = row.value;
  }
  return value;
}

const cachedFetchSettings = unstable_cache(fetchSettingsFromDb, ["mail-settings"], {
  tags: ["settings"],
  revalidate: 300,
});

/**
 * Liefert alle Zeilen aus public.settings als Record<key, value>. Ein
 * fehlender Schlüssel ist schlicht nicht im Record enthalten, der Aufrufer
 * entscheidet über Fallbacks (siehe lib/mail/resend.ts).
 */
export const getSettings = cache(async (): Promise<Record<string, string>> => {
  try {
    return await cachedFetchSettings();
  } catch {
    // Kein Next.js-Server-Kontext (Skripte unter scripts/, Tests via
    // vitest) - next/cache ist dort inaktiv, direkt und ungecacht aus der
    // DB lesen (siehe Kommentar oben).
    return fetchSettingsFromDb();
  }
});

/**
 * Invalidiert den Data-Cache-Eintrag für Settings (Tag "settings"). Die
 * primäre Invalidierung nach dem Speichern passiert direkt in der Server
 * Action (app/admin/actions/settings.ts ruft revalidateTag("settings") und
 * revalidatePath("/admin/einstellungen")); diese Funktion bleibt als
 * eigenständiger Re-Export bestehen, weil mehrere Tests (tests/mail/
 * resend.test.ts, tests/followups/schedule-and-run.test.ts) Settings-Zeilen
 * direkt in der DB ändern und danach eine frische Lesung erzwingen wollen.
 * Ausserhalb eines Next-Servers ist next/cache ohnehin inaktiv (siehe
 * getSettings() oben), der Aufruf hier also ein sicheres No-Op.
 */
export function clearSettingsCache(): void {
  try {
    revalidateTag("settings");
  } catch {
    // Kein Next-Request-Kontext (Skripte/Tests) - nichts zu invalidieren,
    // siehe getSettings().
  }
}
