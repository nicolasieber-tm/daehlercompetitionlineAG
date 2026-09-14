// Preislisten-Seite: Mehrfach-Upload, Diff je offenem Import (aufklappbar je
// Baureihe) mit Übernehmen/Verwerfen, Import-Historie. Siehe
// docs/architektur.md, Abschnitt "Excel-Import im Admin". Das PDF auf der
// Website bleibt das Kundendokument, dieser Bereich ist rein intern.
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getImportHistory, getPendingImports } from "@/lib/admin/pricelists";
import { admin } from "@/lib/i18n/admin";
import { Toolbar } from "@/components/admin/Toolbar";
import { PricelistUploadForm } from "@/components/admin/PricelistUploadForm";
import { PricelistDiffCard } from "@/components/admin/PricelistDiffCard";
import { ImportHistoryTable } from "@/components/admin/ImportHistoryTable";

export const metadata: Metadata = { title: `${admin.pricelists.title} – Admin` };

export default async function AdminPricelistsPage() {
  await requireAdmin();

  const [pending, history] = await Promise.all([getPendingImports(), getImportHistory()]);

  return (
    <>
      <Toolbar title={admin.pricelists.title} subtitle={admin.pricelists.subtitle} />

      <PricelistUploadForm />

      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {admin.pricelists.pending.title}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">{admin.pricelists.pending.empty}</p>
        ) : (
          pending.map((p) => (
            <PricelistDiffCard key={p.id} importId={p.id} filenames={p.filenames} createdAt={p.createdAt} diff={p.diff} />
          ))
        )}
      </section>

      <ImportHistoryTable rows={history} />
    </>
  );
}
