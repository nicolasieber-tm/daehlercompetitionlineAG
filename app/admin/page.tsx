// Anfragen-Übersicht (siehe docs/architektur.md, Abschnitt "Admin", und die
// Aufgabenstellung "Admin Teil 1"). Server Component: liest Filter aus den
// URL-Suchparametern, lädt Anfragen direkt über lib/admin/inquiries.ts
// (keine eigene API-Route nötig, siehe FilterBar.tsx/Pagination.tsx: reine
// GET-Links/-Formulare, kein Client-JS für Filtern/Blättern).
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getFamilyFilterOptions,
  listInquiries,
  parseDateParam,
  parseFamilyIdParam,
  parsePageParam,
  parseStatusParam,
} from "@/lib/admin/inquiries";
import type { InquiryListFilters } from "@/lib/admin/inquiries";
import { admin } from "@/lib/i18n/admin";
import { Toolbar } from "@/components/admin/Toolbar";
import { FilterBar } from "@/components/admin/FilterBar";
import { InquiriesTable } from "@/components/admin/InquiriesTable";
import { Pagination } from "@/components/admin/Pagination";

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

  const [result, familyOptions] = await Promise.all([listInquiries(filters), getFamilyFilterOptions()]);

  return (
    <>
      <Toolbar title={admin.list.title} subtitle={admin.list.subtitle} />
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
      <InquiriesTable rows={result.rows} />
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
    </>
  );
}
