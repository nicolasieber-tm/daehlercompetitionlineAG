"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";
import { admin } from "@/lib/i18n/admin";
import { chfFrom, formatDate } from "@/lib/i18n/format";
import { categoryLabel } from "@/lib/mail/render";
import type { InquiryListRow } from "@/lib/admin/inquiries";
import { StatusBadge } from "./StatusBadge";
import { Table, TableBody, TableHead, Th, Td } from "./Table";

// Anfragen-Übersicht: Tabelle ab 800px (Breakpoint md2, siehe app/globals.css
// und docs/architektur.md "Kacheln/Tabellen ... 800px"), Karten darunter
// (Aufgabenstellung "Mobile: Karten statt Tabelle unter 800px").
//
// Ganze Zeile/Karte klickbar (CLAUDE.md Abschnitt "AUFGABE", Punkt 2): eine
// <tr> kann kein echtes <a> sein (kein <a> um <td> herum, ungültiges HTML),
// deshalb role="link"/tabIndex/onClick/onKeyDown auf der Zeile selbst -
// "use client" nur deshalb nötig. Die Nummer bleibt zusätzlich ein echter
// <Link> (Mittelklick/neuer Tab), ein Klick darauf (oder auf einen anderen
// inneren Link/Button) navigiert NICHT zusätzlich über die Zeile
// (isInteractiveTarget() prüft das Event-Ziel). Die Mobile-Karte war schon
// vorher als Ganzes ein <Link> - bleibt unverändert, bekommt nur dieselbe
// Hervorhebung für neu eingetroffene Anfragen.
function wishLabel(row: InquiryListRow): string {
  const parts = row.categories.map((c) => categoryLabel(c, "de"));
  if (row.consulting) parts.push(admin.detail.package.adviceRequested);
  return parts.join(" + ") || admin.common.none;
}

function priceLabel(row: InquiryListRow): string {
  return row.estimatedTotal != null ? chfFrom(row.estimatedTotal, "de") : admin.list.onRequest;
}

/** true, wenn `target` ein eigenes interaktives Element ist (oder darin liegt) - der Nummer-Link, künftige Buttons/mailto-Links. */
function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest("a, button, input, textarea, select, [role='button']");
}

const EMPTY_HIGHLIGHT: ReadonlySet<string> = new Set();

export function InquiriesTable({
  rows,
  highlightIds = EMPTY_HIGHLIGHT,
}: {
  rows: InquiryListRow[];
  /** ids, die seit dem letzten Live-Refresh neu hinzugekommen sind (components/admin/LiveRefresh.tsx), für die dezente Hervorhebung. */
  highlightIds?: ReadonlySet<string>;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return <p className="border border-dashed border-line-alt bg-panel px-6 py-10 text-center text-sm text-muted">{admin.list.empty}</p>;
  }

  function goToInquiry(id: string) {
    router.push(`/admin/anfragen/${id}`);
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, id: string) {
    if (isInteractiveTarget(event.target)) return;
    goToInquiry(id);
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (isInteractiveTarget(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    goToInquiry(id);
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
              <tr
                key={row.id}
                role="link"
                tabIndex={0}
                aria-label={`${row.number} – ${row.customerName || admin.common.none}`}
                onClick={(e) => handleRowClick(e, row.id)}
                onKeyDown={(e) => handleRowKeyDown(e, row.id)}
                className={[
                  "cursor-pointer transition-colors hover:bg-panel-alt",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-red-bright",
                  highlightIds.has(row.id) ? "bg-red-soft" : "",
                ].join(" ")}
              >
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
              className={[
                "block rounded-[2px] border border-line bg-panel p-4 transition-colors hover:border-line-alt",
                highlightIds.has(row.id) ? "border-l-2 border-l-red-bright bg-red-soft" : "",
              ].join(" ")}
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
