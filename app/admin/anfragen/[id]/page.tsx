// Anfrage-Detailseite: Kopf mit Status/Aktionen, Zusammenfassung (Monospace-
// Ticket wie in der Vorschau) plus strukturierte Karten, Antwortentwurf,
// Mail-Protokoll, Follow-ups, Teilen-Link, Freitext/Rohtext. Siehe
// docs/architektur.md, Abschnitt "Admin", und die Aufgabenstellung
// "Admin Teil 1".
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getInquiryDetail } from "@/lib/admin/inquiries";
import { buildSummaryText } from "@/lib/inquiry/summary";
import { getSettings } from "@/lib/mail";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/i18n/format";
import type { InquiryStatus } from "@/lib/db/rows";
import { Toolbar } from "@/components/admin/Toolbar";
import { BackToOverviewLink } from "@/components/admin/BackToOverviewLink";
import { StatusControl } from "@/components/admin/StatusControl";
import { SummaryBlock } from "@/components/admin/SummaryBlock";
import { CustomerCard } from "@/components/admin/CustomerCard";
import { VehicleCard } from "@/components/admin/VehicleCard";
import { PackageTable } from "@/components/admin/PackageTable";
import { ChecksList } from "@/components/admin/ChecksList";
import { DraftEditor } from "@/components/admin/DraftEditor";
import { MailLog } from "@/components/admin/MailLog";
import { FollowUpsList } from "@/components/admin/FollowUpsList";
import { Card } from "@/components/admin/Card";

export const metadata: Metadata = { title: `${admin.list.title} – Admin` };

export default async function AdminInquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const detail = await getInquiryDetail(id);
  if (!detail) notFound();

  const { ctx, outboundEmails, followUps } = detail;
  const { inquiry } = ctx;

  const [settings, summaryText] = await Promise.all([getSettings(), Promise.resolve(buildSummaryText(ctx))]);

  const overrideAddress = process.env.MAIL_TO_OVERRIDE || undefined;

  return (
    <>
      <BackToOverviewLink />
      <Toolbar
        title={tf(admin.detail.title, { number: inquiry.number })}
        subtitle={[
          `${formatDate(new Date(inquiry.created_at), "de")}`,
          admin.source[inquiry.source as "web" | "quick"],
          inquiry.replied_at ? tf(admin.detail.repliedAt, { date: formatDate(new Date(inquiry.replied_at), "de") }) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <StatusControl
            inquiryId={inquiry.id}
            status={inquiry.status as InquiryStatus}
            answerReceivedAt={inquiry.answer_received_at}
          />
        }
      />

      <div className="grid gap-6 md2:grid-cols-2">
        <SummaryBlock text={summaryText} />
        <div className="flex flex-col gap-6">
          <CustomerCard ctx={ctx} />
          <VehicleCard ctx={ctx} />
        </div>
      </div>

      <PackageTable ctx={ctx} />
      <ChecksList ctx={ctx} />

      {inquiry.message && (
        <Card title={admin.detail.message.title}>
          <p className="whitespace-pre-wrap text-sm text-text">{inquiry.message}</p>
        </Card>
      )}

      {inquiry.source === "quick" && inquiry.raw_text && (
        <Card title={admin.detail.rawText.title}>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words border border-line bg-bg p-4 font-mono text-[13px] leading-relaxed text-text">
            {inquiry.raw_text}
          </pre>
        </Card>
      )}

      <DraftEditor
        inquiryId={inquiry.id}
        initialSubject={ctx.draft.subject}
        initialBody={ctx.draft.body}
        customerEmail={inquiry.email}
        mailBcc={settings.mail_bcc}
        mailReplyTo={settings.mail_reply_to}
        overrideAddress={overrideAddress}
      />

      <MailLog emails={outboundEmails} />
      <FollowUpsList followUps={followUps} />

      <Card title={admin.detail.share.title}>
        <p className="mb-2 text-sm text-muted">{admin.detail.share.description}</p>
        <a href={ctx.shareUrl} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-red-bright hover:underline">
          {ctx.shareUrl}
        </a>
      </Card>
    </>
  );
}
