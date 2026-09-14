// Admin-Layout für den gesamten /admin-Baum, inklusive /admin/login (siehe
// docs/architektur.md, Ordnerstruktur: nur EIN app/admin/layout.tsx). Ohne
// Session wird nur die jeweilige Seite selbst gerendert (praktisch immer
// /admin/login: middleware.ts leitet jede andere /admin/*-Seite ohne
// Session bereits dorthin um, siehe dortiger Kommentar) - keine
// Sidebar/Navigation ohne eingeloggten Admin. Mit Session kommt die volle
// Shell (components/admin/Shell.tsx) inklusive Menü-Zähler "neu".
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getAdminUser } from "@/lib/admin/auth";
import { getNewInquiriesCount } from "@/lib/admin/inquiries";
import { AdminShell } from "@/components/admin/Shell";

export const metadata: Metadata = {
  title: "Admin – dÄHLer Anfrage-Erlebnis",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getAdminUser();
  if (!user) {
    return <>{children}</>;
  }

  const newCount = await getNewInquiriesCount();

  return (
    <AdminShell user={user} newCount={newCount}>
      {children}
    </AdminShell>
  );
}
