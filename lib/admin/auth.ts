// Admin-Session prüfen, für Pages und Server Actions. Siehe
// docs/umbau-railway.md, Abschnitt "Login": better-auth,
// zwei feste Konten (dÄHLer, Trending Media), kein Rollenmodell - jeder
// eingeloggte User ist Admin.
//
// middleware.ts schützt /admin/* (Redirect) und /api/admin/* (401 JSON)
// bereits am Rand, prüft dort aber nur, ob das Session-Cookie überhaupt
// existiert (siehe dortiger Kommentar, getSessionCookie() aus
// "better-auth/cookies" macht dafür keinen DB-Zugriff). requireAdmin() ist
// die zweite, unabhängige Prüfung innerhalb der Page/Server Action selbst
// (Defense in Depth) und zugleich die einzige Stelle, die den eingeloggten
// User tatsächlich lädt (auth.api.getSession(), mit echtem DB-Zugriff:
// prüft, ob die Session noch existiert/gültig ist, nicht nur das Cookie).
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";

/** Minimale Nutzer-Form, die der Admin-Bereich tatsächlich braucht (id, E-Mail). */
export interface AdminUser {
  id: string;
  email: string;
}

/**
 * Minimale Client-Form, die requireAdmin()/getAdminUser() tatsächlich
 * brauchen (nur auth.api.getSession()). So kann ein Test einen gemockten
 * Client übergeben, ohne die komplette better-auth-Instanz nachzubauen
 * (siehe tests/admin/auth.test.ts: "requireAdmin mit gemocktem Client").
 */
export interface AdminAuthClient {
  api: {
    getSession(input: { headers: Headers }): Promise<{ user: { id: string; email: string } } | null>;
  };
}

/**
 * Liefert den eingeloggten Admin-User oder null, ohne umzuleiten. Für
 * Stellen, die je nach Session unterschiedlich rendern sollen statt
 * strikt zu blockieren (app/admin/layout.tsx: ohne Session nur die
 * Login-Seite ohne Sidebar/Navigation zeigen, siehe dortiger Kommentar).
 */
export async function getAdminUser(client?: AdminAuthClient): Promise<AdminUser | null> {
  // next/headers' headers() wirft ausserhalb eines laufenden Next.js-
  // Requests (Tests via vitest, siehe tests/admin/auth.test.ts) - beim
  // echten better-auth-Client (kein client-Argument) unvermeidlich nötig,
  // bei einem gemockten Client dagegen irrelevant (der Mock ignoriert das
  // Argument ohnehin und antwortet allein anhand seines Closures), daher
  // hier ausgelassen.
  const headers = client ? new Headers() : await nextHeaders();
  const authClient = client ?? auth;
  const result = await authClient.api.getSession({ headers });
  if (!result?.user) return null;
  return { id: result.user.id, email: result.user.email };
}

/**
 * Für Pages und Server Actions: liefert den eingeloggten Admin-User oder
 * leitet auf /admin/login um (next/navigation redirect(), wirft einen
 * speziellen NEXT_REDIRECT-Fehler, den Next.js selbst auffängt).
 *
 * redirectTo erlaubt ?next=<pfad>, wird aber normalerweise nicht gebraucht:
 * middleware.ts hat den ursprünglichen Pfad für den Normalfall (kein
 * Cookie/keine Session) bereits vor dem Rendern der Page angehängt. Dieser
 * Parameter deckt nur den Fall ab, dass requireAdmin() selbst die erste
 * Instanz ist, die die fehlende/abgelaufene Session bemerkt.
 */
export async function requireAdmin(client?: AdminAuthClient, redirectTo?: string): Promise<AdminUser> {
  const user = await getAdminUser(client);
  if (!user) {
    redirect(redirectTo ?? "/admin/login");
  }
  return user;
}
