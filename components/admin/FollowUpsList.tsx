import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/i18n/format";
import type { InquiryFollowUp } from "@/lib/admin/inquiries";
import { Card } from "./Card";
import { Table, TableBody, TableHead, Th, Td } from "./Table";

function statusOf(f: InquiryFollowUp): { label: string; className: string } {
  if (f.cancelled_at) return { label: admin.detail.followups.cancelled, className: "text-dim" };
  if (f.sent_at) {
    return {
      label: tf(admin.detail.followups.sent, { date: formatDate(new Date(f.sent_at), "de") }),
      className: "text-ok",
    };
  }
  return {
    label: tf(admin.detail.followups.scheduled, { date: formatDate(new Date(`${f.scheduled_for}T00:00:00`), "de") }),
    className: "text-warn",
  };
}

/** Follow-ups der Anfrage: geplant/gesendet/storniert (Aufgabenstellung). */
export function FollowUpsList({ followUps }: { followUps: InquiryFollowUp[] }) {
  return (
    <Card title={admin.detail.followups.title}>
      {followUps.length === 0 ? (
        <p className="text-sm text-muted">{admin.detail.followups.empty}</p>
      ) : (
        <Table>
          <TableHead>
            <Th>{admin.detail.followups.columns.rule}</Th>
            <Th>{admin.detail.followups.columns.status}</Th>
          </TableHead>
          <TableBody>
            {followUps.map((f) => {
              const status = statusOf(f);
              return (
                <tr key={f.id}>
                  <Td>{f.ruleName ?? admin.common.none}</Td>
                  <Td className={status.className}>{status.label}</Td>
                </tr>
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
