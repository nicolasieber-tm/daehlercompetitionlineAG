// Admin-Login: E-Mail/Passwort, Fehlertext, Redirect auf ?next nach
// erfolgreicher Anmeldung (siehe components/admin/LoginForm.tsx und
// middleware.ts, die ?next beim Umleiten unangemeldeter Zugriffe setzt).
// app/admin/layout.tsx zeigt hier bewusst KEINE Sidebar (siehe dortiger
// Kommentar).
//
// Befund (Bericht, Phase E3): mit bereits gültiger Session liess sich die
// Login-Seite trotzdem aufrufen und zeigte das Formular erneut, statt direkt
// in den Admin-Bereich zu leiten (middleware.ts prüft nur das
// Session-Cookie, nicht seine Gültigkeit, und schützt /admin/login ohnehin
// nicht - das ist ja gerade die öffentlich erreichbare Seite). Deshalb hier
// zusätzlich getAdminUser() (echter DB-Zugriff, prüft die Session wirklich)
// und bei vorhandenem User redirect() auf /admin.
import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin/auth";
import { admin } from "@/lib/i18n/admin";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: `${admin.login.title} – dÄHLer`,
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const user = await getAdminUser();
  if (user) {
    redirect("/admin");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="text-center">
        <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-red-bright">
          {admin.login.subtitle}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-wide text-text">
          {admin.login.title}
        </h1>
      </div>
      {/* useSearchParams() in LoginForm verlangt eine Suspense-Grenze (Next-Regel für Client-Komponenten mit diesem Hook). */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
