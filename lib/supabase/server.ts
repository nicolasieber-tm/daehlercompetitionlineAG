import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Supabase-Client für Server Components, Route Handlers und Server Actions.
 * Nutzt die Cookies der laufenden Anfrage, damit RLS mit der Session des
 * eingeloggten Admin-Users greift. Muss pro Request neu erzeugt werden
 * (nicht als Modul-Singleton), weil er an die Request-Cookies gebunden ist.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll wird auch aus Server Components aufgerufen, wo das
            // Setzen von Cookies nicht erlaubt ist. Das darf ignoriert
            // werden, solange middleware.ts die Session zusätzlich erneuert.
          }
        },
      },
    },
  );
}
