// Schnellweg (Posten 3): Freitext (Mail/Telefonnotiz) auswerten und als
// Anfrage anlegen. Siehe docs/architektur.md, Abschnitt "Posten 3,
// Schnellweg". Kein Versand an den Kunden.
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getFamilies } from "@/lib/catalog/queries";
import { admin } from "@/lib/i18n/admin";
import { Toolbar } from "@/components/admin/Toolbar";
import { QuickInquiryForm } from "@/components/admin/QuickInquiryForm";

export const metadata: Metadata = { title: `${admin.quick.title} – Admin` };

export default async function AdminQuickPage() {
  await requireAdmin();
  const families = await getFamilies();

  return (
    <>
      <Toolbar title={admin.quick.title} subtitle={admin.quick.subtitle} />
      <QuickInquiryForm families={families} />
    </>
  );
}
