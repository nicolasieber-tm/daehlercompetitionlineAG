import { admin } from "@/lib/i18n/admin";
import { chf, chfFrom } from "@/lib/i18n/format";
import { categoryLabel } from "@/lib/mail/render";
import { displayItemFields } from "@/lib/catalog/product-display";
import type { MailInquiryContext } from "@/lib/mail/types";
import { Card } from "./Card";
import { Table, TableBody, TableHead, Th, Td } from "./Table";

/** Strukturierte Paket-Tabelle (Preise), zusätzlich zum Monospace-Ticket (components/admin/SummaryBlock.tsx). */
export function PackageTable({ ctx }: { ctx: MailInquiryContext }) {
  const { items, estimatedTotal, inquiry } = ctx;

  // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
  // dieselbe Positionsdarstellung wie im Antwortentwurf/den Mails ("Stufe 1
  // (620 PS / 740 Nm, M6 & A8-Getriebe)" statt des vollen Excel-Namens),
  // PLUS den Original-Excel-Namen als eigene, kleine zweite Zeile - "dÄHLer
  // kennt seine Bezeichnungen". isStage über ps_to (nur bei
  // Motor-Leistungsstufen gefüllt, siehe lib/mail/types.ts
  // MailInquiryItem-Kommentar), wie lib/inquiry/summary.ts displayItem().
  const displayItems = items.map((item) => ({
    item,
    display: displayItemFields(
      { name: item.name, description: item.description, isStage: item.ps_to != null, psTo: item.ps_to ?? null, nmTo: item.nm_to ?? null },
      "de",
    ),
  }));

  return (
    <Card title={admin.detail.package.title}>
      {items.length === 0 && !inquiry.consulting ? (
        <p className="text-sm text-muted">{admin.detail.package.empty}</p>
      ) : (
        <Table>
          <TableHead>
            <Th>{admin.detail.package.category}</Th>
            <Th>{admin.detail.package.item}</Th>
            <Th className="text-right">{admin.detail.package.price}</Th>
          </TableHead>
          <TableBody>
            {displayItems.map(({ item, display }, i) => (
              <tr key={i}>
                <Td className="whitespace-nowrap text-muted">{categoryLabel(item.category, "de")}</Td>
                <Td>
                  <div className="text-text">{display.name}</div>
                  {display.description && <div className="text-xs text-muted">{display.description}</div>}
                  {display.originalName && (
                    <div className="text-xs text-dim">Excel: {display.originalName}</div>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-right font-mono text-xs">
                  {item.price_status === "priced" && item.price_total != null
                    ? chfFrom(item.price_total, "de")
                    : admin.priceStatus[item.price_status]}
                </Td>
              </tr>
            ))}
            {inquiry.consulting && (
              <tr>
                <Td colSpan={2} className="text-muted">
                  {admin.detail.package.adviceRequested}
                </Td>
                <Td />
              </tr>
            )}
          </TableBody>
        </Table>
      )}
      <div className="mt-4 flex items-center justify-between border-t-2 border-red pt-3">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted">
          {admin.detail.package.total}
        </span>
        <span className="font-mono text-lg font-bold text-text">
          {estimatedTotal != null ? chf(estimatedTotal) : admin.list.onRequest}
        </span>
      </div>
    </Card>
  );
}
