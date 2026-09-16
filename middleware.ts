import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware: schützt /admin/* (ausser /admin/login) und /api/admin/*.
 * Prüft nur, ob better-auths Session-Cookie überhaupt existiert
 * (getSessionCookie() aus "better-auth/cookies" liest/verifiziert nur das
 * Cookie, ohne DB-Zugriff - für die Middleware, die auf jeder Anfrage
 * läuft, bewusst schnell und ohne Netzwerk-Roundtrip gehalten, siehe
 * docs/umbau-railway.md, Abschnitt "Login": "middleware.ts prüft nur das
 * Session-Cookie"). Ob die Session dahinter noch gültig ist (nicht
 * abgelaufen, nicht gelöscht), prüft lib/admin/auth.ts requireAdmin()
 * serverseitig mit echtem DB-Zugriff (auth.api.getSession()) - das ist die
 * massgebliche Prüfung, diese Middleware ist nur der schnelle erste Filter.
 *
 * Zwei unterschiedliche Reaktionen ohne Cookie (siehe CLAUDE.md, Abschnitt
 * "Route Handler"): Seiten (/admin/*) -> Redirect auf /admin/login mit
 * ?next=<ursprünglicher Pfad>, damit app/admin/login/page.tsx nach
 * erfolgreichem Login dorthin zurückführen kann. API-Routen (/api/admin/*)
 * -> 401 JSON statt Redirect, ein fetch()-Aufruf soll dort kein HTML einer
 * Login-Seite als "Erfolg" interpretieren.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiAdminRoute = pathname.startsWith("/api/admin");
  const isAdminPage = pathname.startsWith("/admin");
  const isLoginPage = pathname.startsWith("/admin/login");

  const sessionCookie = getSessionCookie(request);

  if (sessionCookie) {
    return NextResponse.next();
  }

  if (isApiAdminRoute) {
    return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }

  if (isAdminPage && !isLoginPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
