import { admin } from "@/lib/i18n/admin";
import type { OutboundEmail } from "@/lib/supabase/rows";
import { formatDateTime } from "./format";
import { Card } from "./Card";
import { Table, TableBody, TableHead, Th, Td } from "./Table";

/** Mail-Protokoll der Anfrage (outbound_emails): Typ, Empfänger, Status, Fehler, Zeit (Aufgabenstellung). */
export function MailLog({ emails }: { emails: OutboundEmail[] }) {
  return (
    <Card title={admin.detail.mailLog.title}>
      {emails.length === 0 ? (
        <p className="text-sm text-muted">{admin.detail.mailLog.empty}</p>
      ) : (
        <Table>
          <TableHead>
            <Th>{admin.detail.mailLog.columns.type}</Th>
            <Th>{admin.detail.mailLog.columns.to}</Th>
            <Th>{admin.detail.mailLog.columns.status}</Th>
            <Th>{admin.detail.mailLog.columns.error}</Th>
            <Th>{admin.detail.mailLog.columns.sentAt}</Th>
          </TableHead>
          <TableBody>
            {emails.map((mail) => (
              <tr key={mail.id}>
                <Td className="whitespace-nowrap">
                  {admin.emailType[mail.type as keyof typeof admin.emailType] ?? mail.type}
                </Td>
                <Td className="whitespace-nowrap">{mail.to_email}</Td>
                <Td>
                  <span className={mail.status === "failed" ? "text-red-bright" : "text-ok"}>
                    {admin.emailStatus[mail.status as keyof typeof admin.emailStatus] ?? mail.status}
                  </span>
                </Td>
                <Td className="max-w-[240px] text-xs text-muted">{mail.error ?? ""}</Td>
                <Td className="whitespace-nowrap text-xs text-muted">
                  {formatDateTime(mail.sent_at ?? mail.created_at)}
                </Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
