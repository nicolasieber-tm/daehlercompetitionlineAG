import Link from "next/link";
import { admin } from "@/lib/i18n/admin";
import { chfFrom, formatDate } from "@/lib/i18n/format";
import { categoryLabel } from "@/lib/mail/render";
import type { InquiryListRow } from "@/lib/admin/inquiries";
import { StatusBadge } from "./StatusBadge";
import { Table, TableBody, TableHead, Th, Td } from "./Table";

// Anfragen-Übersicht: Tabelle ab 800px (Breakpoint md2, siehe app/globals.css
// und docs/architektur.md "Kacheln/Tabellen ... 800px"), Karten darunter
// (Aufgabenstellung "Mobile: Karten statt Tabelle unter 800px"). Beides wird
// serverseitig gerendert, die CSS-Klassen blenden je Breakpoint eine der
// beiden Darstellungen aus - kein Client-JS nötig.
function wishLabel(row: InquiryListRow): string {
  const parts = row.categories.map((c) => categoryLabel(c, "de"));
  if (row.consulting) parts.push(admin.detail.package.adviceRequested);
  return parts.join(" + ") || admin.common.none;
}

function priceLabel(row: InquiryListRow): string {
  return row.estimatedTotal != null ? chfFrom(row.estimatedTotal, "de") : admin.list.onRequest;
}

export function InquiriesTable({ rows }: { rows: InquiryListRow[] }) {
  if (rows.length === 0) {
    return <p className="border border-dashed border-line-alt bg-panel px-6 py-10 text-center text-sm text-muted">{admin.list.empty}</p>;
  }

  return (
    <>
      {/* Desktop/Tablet: Tabelle */}
      <div className="hidden md2:block">
        <Table>
          <TableHead>
            <Th>{admin.list.columns.number}</Th>
            <Th>{admin.list.columns.date}</Th>
            <Th>{admin.list.columns.customer}</Th>
            <Th>{admin.list.columns.vehicle}</Th>
            <Th>{admin.list.columns.wish}</Th>
            <Th className="text-right">{admin.list.columns.price}</Th>
            <Th>{admin.list.columns.status}</Th>
            <Th>{admin.list.columns.source}</Th>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-panel-alt">
                <Td className="whitespace-nowrap font-mono text-xs">
                  <Link href={`/admin/anfragen/${row.id}`} className="text-red-bright hover:underline">
                    {row.number}
                  </Link>
                </Td>
                <Td className="whitespace-nowrap text-muted">{formatDate(new Date(row.createdAt), "de")}</Td>
                <Td>
                  <div className="font-medium">{row.customerName || admin.common.none}</div>
                  {row.city && <div className="text-xs text-muted">{row.city}</div>}
                </Td>
                <Td>{row.vehicleLabel || admin.common.none}</Td>
                <Td className="text-muted">{wishLabel(row)}</Td>
                <Td className="whitespace-nowrap text-right font-mono text-xs">{priceLabel(row)}</Td>
                <Td>
                  <StatusBadge status={row.status} />
                </Td>
                <Td className="text-muted">{admin.source[row.source]}</Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: Karten */}
      <ul className="flex flex-col gap-3 md2:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/admin/anfragen/${row.id}`}
              className="block rounded-[2px] border border-line bg-panel p-4 transition-colors hover:border-line-alt"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-xs text-red-bright">{row.number}</div>
                  <div className="mt-1 font-medium text-text">{row.customerName || admin.common.none}</div>
                </div>
                <StatusBadge status={row.status} />
              </div>
              <div className="mt-2 text-sm text-text">{row.vehicleLabel || admin.common.none}</div>
              <div className="mt-1 text-sm text-muted">{wishLabel(row)}</div>
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>{formatDate(new Date(row.createdAt), "de")} · {admin.source[row.source]}</span>
                <span className="font-mono">{priceLabel(row)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
