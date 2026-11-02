// Mailtexte: Einleitung, Charaktersätze, Rückfragen, Termin und Schluss der
// Mails an Kunden, mit Live-Vorschau (Rückmeldung dÄHLer 28.10.2026, vorher
// zuunterst in den Einstellungen). Siehe lib/mail/texts.ts.
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getSettings } from "@/lib/mail";
import { admin } from "@/lib/i18n/admin";
import { Toolbar } from "@/components/admin/Toolbar";
import { MailTextsEditor } from "@/components/admin/MailTextsEditor";
import { resolveMailTexts } from "@/lib/mail/texts";

export const metadata: Metadata = { title: `${admin.mailTexts.title} – Admin` };

export default async function AdminMailTextsPage() {
  await requireAdmin();
  const settings = await getSettings();

  // Signatur der Vorschau aus den Einstellungen (wie in buildDraft()).
  const signature = {
    name: settings.signature_name ?? "",
    company: settings.mail_from_name ?? "",
    address: settings.company_address ?? "",
    phone: settings.signature_phone ?? "",
  };

  return (
    <>
      <Toolbar title={admin.mailTexts.title} subtitle={admin.mailTexts.subtitle} />
      <MailTextsEditor
        values={{ de: resolveMailTexts("de", settings), en: resolveMailTexts("en", settings) }}
        signature={signature}
      />
    </>
  );
}
