// Import-Historie (pricelist_imports): Datum, Dateien, Status, Zähler.
// Server Component (reine Anzeige, keine Interaktion), siehe
// app/admin/preislisten/page.tsx.
import { admin } from "@/lib/i18n/admin";
import { formatDate } from "@/lib/i18n/format";
import type { ImportHistoryRow } from "@/lib/admin/pricelists";
import { Card } from "./Card";
import { Table, TableHead, TableBody, Th, Td } from "./Table";

const t = admin.pricelists.history;

const STATUS_COLORS: Record<string, string> = {
  pending: "text-warn",
  applied: "text-ok",
  discarded: "text-muted",
  failed: "text-red-bright",
};

function countsText(summary: Record<string, unknown> | null): string {
  if (!summary) return "-";
  const num = (key: string) => (typeof summary[key] === "number" ? (summary[key] as number) : 0);
  const parts = [
    `+${num("productsAdded")}`,
    `~${num("productsChanged")}`,
    `-${num("productsRemoved")}`,
  ];
  const errors = Array.isArray(summary.errors) ? summary.errors.length : 0;
  const text = `Produkte ${parts.join(" ")}`;
  return errors > 0 ? `${text} · ${errors} Fehler` : text;
}

export function ImportHistoryTable({ rows }: { rows: ImportHistoryRow[] }) {
  return (
    <Card title={t.title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <Table>
          <TableHead>
            <Th>{t.columns.date}</Th>
            <Th>{t.columns.files}</Th>
            <Th>{t.columns.status}</Th>
            <Th>{t.columns.counts}</Th>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td className="whitespace-nowrap">{formatDate(new Date(row.createdAt), "de")}</Td>
                <Td className="max-w-[320px] truncate">{row.filenames.join(", ")}</Td>
                <Td>
                  <span className={`font-semibold ${STATUS_COLORS[row.status] ?? "text-muted"}`}>
                    {t.status[row.status]}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">{countsText(row.summary)}</Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
