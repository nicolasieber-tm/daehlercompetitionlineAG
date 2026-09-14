// Modelle-Übersicht: alle Baureihen mit Foto-Thumbnail (oder Markierung
// «Foto fehlt»), Name, Marke, Preisliste ja/nein, aktiv, Anzahl Modelle/
// Produkte. Siehe docs/architektur.md, Abschnitt "Datenmodell".
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { getFamiliesForAdmin } from "@/lib/admin/models";
import { admin } from "@/lib/i18n/admin";
import { Toolbar } from "@/components/admin/Toolbar";
import { Table, TableHead, TableBody, Th, Td } from "@/components/admin/Table";

export const metadata: Metadata = { title: `${admin.models.title} – Admin` };

const t = admin.models.list;

export default async function AdminModelsPage() {
  await requireAdmin();
  const families = await getFamiliesForAdmin();

  return (
    <>
      <Toolbar title={admin.models.title} subtitle={admin.models.subtitle} />

      {families.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <Table>
          <TableHead>
            <Th>{t.columns.photo}</Th>
            <Th>{t.columns.name}</Th>
            <Th>{t.columns.brand}</Th>
            <Th>{t.columns.pricelist}</Th>
            <Th>{t.columns.active}</Th>
            <Th>{t.columns.models}</Th>
            <Th>{t.columns.products}</Th>
          </TableHead>
          <TableBody>
            {families.map((f) => (
              <tr key={f.id}>
                <Td>
                  {f.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL, next/image-Domain-Konfiguration nicht Teil dieser Aufgabe
                    <img src={f.photoUrl} alt={f.name} className="h-10 w-16 rounded-[2px] object-cover" />
                  ) : (
                    <span className="inline-block rounded-[2px] border border-dashed border-line-alt px-2 py-1 text-[11px] text-dim">
                      {t.noPhoto}
                    </span>
                  )}
                </Td>
                <Td className="font-semibold">
                  <Link href={`/admin/modelle/${f.slug}`} className="text-text hover:text-red-bright hover:underline">
                    {f.name}
                  </Link>
                </Td>
                <Td>{f.brand}</Td>
                <Td>{f.hasPricelist ? t.pricelistYes : t.pricelistNo}</Td>
                <Td>{f.active ? admin.common.yes : admin.common.no}</Td>
                <Td>{f.modelCount}</Td>
                <Td>{f.productCount}</Td>
              </tr>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
