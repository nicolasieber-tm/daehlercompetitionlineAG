// Liste anstehender Follow-ups (30 Tage) mit Link zur Anfrage. Reine
// Anzeige (Server Component), siehe app/admin/follow-ups/page.tsx.
import Link from "next/link";
import { admin } from "@/lib/i18n/admin";
import { formatDate } from "@/lib/i18n/format";
import type { UpcomingFollowUpRow } from "@/lib/admin/followups";
import { Card } from "./Card";
import { Table, TableHead, TableBody, Th, Td } from "./Table";

const t = admin.followups.upcoming;

export function UpcomingFollowUpsList({ rows }: { rows: UpcomingFollowUpRow[] }) {
  return (
    <Card title={t.title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <Table>
          <TableHead>
            <Th>{t.columns.date}</Th>
            <Th>{t.columns.inquiry}</Th>
            <Th>{t.columns.customer}</Th>
            <Th>{t.columns.rule}</Th>
            <Th />
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">{formatDate(new Date(r.scheduledFor), "de")}</Td>
                <Td>
                  {r.inquiryNumber} · {r.vehicleLabel}
                </Td>
                <Td>{r.customerName}</Td>
                <Td>{r.ruleName ?? "-"}</Td>
                <Td>
                  <Link href={`/admin/anfragen/${r.inquiryId}`} className="text-red-bright hover:underline">
                    {t.openLink}
                  </Link>
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
