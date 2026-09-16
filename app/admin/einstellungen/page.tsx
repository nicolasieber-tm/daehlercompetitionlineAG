// Einstellungen: Formular für alle settings-Schlüssel, Anzeige des aktiven
// MAIL_TO_OVERRIDE/RESEND_FROM_OVERRIDE (Aufgabenstellung). Siehe
// docs/architektur.md, Abschnitt "Umgebungsvariablen": beide Variablen sind
// Testmodus-Adressen, keine Zugangsschlüssel, daher ohne Bedenken anzeigbar
// (nur die Adresse, nie RESEND_API_KEY o.ä.).
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getSettings } from "@/lib/mail";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { Toolbar } from "@/components/admin/Toolbar";
import { Card } from "@/components/admin/Card";
import { SettingsForm } from "@/components/admin/SettingsForm";

export const metadata: Metadata = { title: `${admin.settings.title} – Admin` };

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSettings();

  const mailToOverride = process.env.MAIL_TO_OVERRIDE || null;
  const resendFromOverride = process.env.RESEND_FROM_OVERRIDE || null;

  return (
    <>
      <Toolbar title={admin.settings.title} subtitle={admin.settings.subtitle} />

      <Card title={admin.settings.title}>
        <SettingsForm values={settings} />
      </Card>

      <Card title={admin.settings.overrides.title}>
        <p className="mb-3 text-sm text-muted">{admin.settings.overrides.description}</p>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li className={mailToOverride ? "text-warn" : "text-dim"}>
            {mailToOverride
              ? tf(admin.settings.overrides.mailToActive, { value: mailToOverride })
              : admin.settings.overrides.mailToInactive}
          </li>
          <li className={resendFromOverride ? "text-warn" : "text-dim"}>
            {resendFromOverride
              ? tf(admin.settings.overrides.resendFromActive, { value: resendFromOverride })
              : admin.settings.overrides.resendFromInactive}
          </li>
        </ul>
      </Card>
    </>
  );
}
