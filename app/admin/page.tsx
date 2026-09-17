// Anfragen-Übersicht (siehe docs/architektur.md, Abschnitt "Admin", und die
// Aufgabenstellung "Admin Teil 1"). Server Component: liest Filter aus den
// URL-Suchparametern, lädt Anfragen direkt über lib/admin/inquiries.ts
// (keine eigene API-Route nötig, siehe FilterBar.tsx/Pagination.tsx: reine
// GET-Links/-Formulare, kein Client-JS für Filtern/Blättern).
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getFamilyFilterOptions,
  getInquiriesHeartbeat,
  listInquiries,
  parseDateParam,
  parseFamilyIdParam,
  parsePageParam,
  parseStatusParam,
} from "@/lib/admin/inquiries";
import type { InquiryListFilters } from "@/lib/admin/inquiries";
import { admin } from "@/lib/i18n/admin";
import { resolvePollMs } from "@/lib/admin/live-refresh";
import { FilterBar } from "@/components/admin/FilterBar";
import { Pagination } from "@/components/admin/Pagination";
import { LiveRefresh } from "@/components/admin/LiveRefresh";

export const metadata: Metadata = { title: `${admin.list.title} – Admin` };

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const filters: InquiryListFilters = {
    status: parseStatusParam(one(params.status)),
    familyId: parseFamilyIdParam(one(params.family)),
    dateFrom: parseDateParam(one(params.from)),
    dateTo: parseDateParam(one(params.to)),
    search: one(params.q) || undefined,
    page: parsePageParam(one(params.page)),
  };

  const [result, familyOptions, initialHeartbeat] = await Promise.all([
    listInquiries(filters),
    getFamilyFilterOptions(),
    // Ausgangslage für den ersten Poll (components/admin/LiveRefresh.tsx):
    // ohne sie wüsste der erste Poll nach dem Laden nicht, ob sich seitdem
    // etwas geändert hat (hasChanged() bräuchte einen echten Vorher-Stand,
    // nicht nur "null"), eine zwischen Laden und erstem Poll eingetroffene
    // Anfrage würde sonst erst beim ÜBERNÄCHSTEN Poll bemerkt.
    getInquiriesHeartbeat(),
  ]);
  // ADMIN_POLL_MS: nur für Tests da (tests/e2e/admin.spec.ts verkürzt das
  // Poll-Intervall auf 3s statt der Standard-30s), siehe
  // lib/admin/live-refresh.ts resolvePollMs().
  const pollMs = resolvePollMs(process.env.ADMIN_POLL_MS);

  return (
    <LiveRefresh
      title={admin.list.title}
      subtitle={admin.list.subtitle}
      rows={result.rows}
      pollMs={pollMs}
      initialHeartbeat={initialHeartbeat}
      filterBar={
        <FilterBar
          values={{
            status: filters.status,
            familyId: filters.familyId,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            search: filters.search,
          }}
          familyOptions={familyOptions}
        />
      }
      pagination={
        <Pagination
          page={result.page}
          pageCount={result.pageCount}
          total={result.total}
          values={{
            status: filters.status,
            familyId: filters.familyId,
            dateFrom: filters.dateFrom,
            dateTo: filters.dateTo,
            search: filters.search,
          }}
        />
      }
    />
  );
}
