import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-Role-Client, umgeht RLS vollständig. Ausschliesslich für
 * serverseitigen Code (Route Handlers, Server Actions, Scripts), nie für
 * Client Components. Laufzeit-Guard statt des "server-only"-Pakets (nicht
 * in der freigegebenen Paketliste): bricht ab, sobald der Code im Browser
 * ausgeführt würde, spätestens beim Aufruf von createAdminClient().
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/supabase/admin.ts darf nicht im Browser importiert werden (Service-Role-Key).",
  );
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient: NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
