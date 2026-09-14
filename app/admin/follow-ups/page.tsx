// Follow-ups-Seite (Posten 6): Regeln-Tabelle mit anlegen/bearbeiten/
// löschen, Liste anstehender Follow-ups (30 Tage), «Fällige jetzt senden».
// Siehe CLAUDE.md, Abschnitt "Follow-ups (Posten 6)".
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { listRules, listUpcomingFollowUps } from "@/lib/admin/followups";
import { admin } from "@/lib/i18n/admin";
import { Toolbar } from "@/components/admin/Toolbar";
import { FollowUpRulesManager } from "@/components/admin/FollowUpRulesManager";
import { UpcomingFollowUpsList } from "@/components/admin/UpcomingFollowUpsList";
import { RunDueFollowUpsButton } from "@/components/admin/RunDueFollowUpsButton";

export const metadata: Metadata = { title: `${admin.followups.title} – Admin` };

export default async function AdminFollowUpsPage() {
  await requireAdmin();
  const [rules, upcoming] = await Promise.all([listRules(), listUpcomingFollowUps()]);

  return (
    <>
      <Toolbar title={admin.followups.title} subtitle={admin.followups.subtitle} />
      <FollowUpRulesManager rules={rules} />
      <RunDueFollowUpsButton />
      <UpcomingFollowUpsList rows={upcoming} />
    </>
  );
}
