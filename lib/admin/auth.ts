// Admin-Session prüfen, für Pages und Server Actions. Siehe
// docs/architektur.md, Abschnitt "Sicherheit": "Admin = jeder authentifizierte
// Supabase-User ... Kein Rollenmodell." und CLAUDE.md-Auftrag: "Admin-Routen
// und -Seiten prüfen die Supabase-Session (lib/supabase/server.ts), sonst 401
// bzw. Redirect."
//
// middleware.ts schützt /admin/* (Redirect) und /api/admin/* (401 JSON)
// bereits am Rand. requireAdmin() ist die zweite, unabhängige Prüfung
// innerhalb der Page/Server Action selbst (Defense in Depth: eine Server
// Action wird nicht zwingend über denselben Pfad aufgerufen, den die
// Middleware matcht, siehe dortiger Kommentar), und der einzige Ort, an dem
// eine Page/Action den eingeloggten User selbst braucht (z.B. für
// created_by).
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Minimale Client-Form, die requireAdmin()/getAdminUser() tatsächlich
 * brauchen (nur auth.getUser()). So kann ein Test einen gemockten Client
 * übergeben, ohne einen vollständigen SupabaseClient<Database> nachzubauen
 * (siehe tests/admin/auth.test.ts: "requireAdmin mit gemocktem Client").
 */
export interface AdminAuthClient {
  auth: {
    getUser(): Promise<{ data: { user: User | null } }>;
  };
}

/**
 * Liefert den eingeloggten Admin-User oder null, ohne umzuleiten. Für
 * Stellen, die je nach Session unterschiedlich rendern sollen statt
 * strikt zu blockieren (app/admin/layout.tsx: ohne Session nur die
 * Login-Seite ohne Sidebar/Navigation zeigen, siehe dortiger Kommentar).
 */
export async function getAdminUser(client?: AdminAuthClient): Promise<User | null> {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Für Pages und Server Actions: liefert den eingeloggten Admin-User oder
 * leitet auf /admin/login um (next/navigation redirect(), wirft einen
 * speziellen NEXT_REDIRECT-Fehler, den Next.js selbst auffängt - siehe
 * next/dist/client/components/redirect.js). In einer Server Action bewirkt
 * das denselben Redirect beim Client wie bei einer Page.
 *
 * redirectTo erlaubt ?next=<pfad>, wird aber normalerweise nicht gebraucht:
 * middleware.ts hat den ursprünglichen Pfad für den Normalfall (kein
 * Cookie/keine Session) bereits vor dem Rendern der Page angehängt. Dieser
 * Parameter deckt nur den Fall ab, dass requireAdmin() selbst die erste
 * Instanz ist, die die fehlende Session bemerkt (z.B. eine abgelaufene
 * Session zwischen Middleware- und Page-Aufruf).
 */
export async function requireAdmin(client?: AdminAuthClient, redirectTo?: string): Promise<User> {
  const user = await getAdminUser(client);
  if (!user) {
    redirect(redirectTo ?? "/admin/login");
  }
  return user;
}
