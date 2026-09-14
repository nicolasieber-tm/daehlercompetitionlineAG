import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware: schützt /admin/* (ausser /admin/login) und /api/admin/*,
 * erneuert nebenbei die Supabase-Session, Muster @supabase/ssr
 * "updateSession" (https://supabase.com/docs/guides/auth/server-side/nextjs).
 *
 * Zwei unterschiedliche Reaktionen ohne Session (siehe CLAUDE.md, Abschnitt
 * "Route Handler"): Seiten (/admin/*) -> Redirect auf /admin/login mit
 * ?next=<ursprünglicher Pfad>, damit app/admin/login/page.tsx nach
 * erfolgreichem Login dorthin zurückführen kann. API-Routen (/api/admin/*)
 * -> 401 JSON statt Redirect, ein fetch()-Aufruf soll dort kein HTML einer
 * Login-Seite als "Erfolg" interpretieren.
 *
 * lib/admin/auth.ts requireAdmin() prüft zusätzlich serverseitig in jeder
 * Page/Server Action (Defense in Depth), falls diese Middleware je
 * übersprungen wird.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;
  const isApiAdminRoute = pathname.startsWith("/api/admin");
  const isAdminPage = pathname.startsWith("/admin");
  const isLoginPage = pathname.startsWith("/admin/login");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Ohne konfigurierte Supabase-Umgebung kann die Middleware keine Session
  // prüfen; sie lässt die Anfrage dann unverändert durch (lokale
  // Entwicklung ohne .env, Build-Zeit-Analyse).
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // getUser() statt getSession(): validiert den Token gegen Supabase Auth,
  // statt nur dem (fälschbaren) Cookie-Inhalt zu vertrauen.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return supabaseResponse;
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

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
