// Anfragen-Übersicht (siehe docs/architektur.md, Abschnitt "Admin", und die
// Aufgabenstellung "Admin Teil 1"). Server Component: liest Filter aus den
// URL-Suchparametern, lädt Anfragen direkt über lib/admin/inquiries.ts
// (keine eigene API-Route nötig, siehe FilterBar.tsx/Pagination.tsx: reine
// GET-Links/-Formulare, kein Client-JS für Filtern/Blättern).
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { getFamilyFilterOptions, listInquiries } from "@/lib/admin/inquiries";
import type { InquiryListFilters } from "@/lib/admin/inquiries";
import { admin } from "@/lib/i18n/admin";
import { Toolbar } from "@/components/admin/Toolbar";
import { FilterBar } from "@/components/admin/FilterBar";
import { InquiriesTable } from "@/components/admin/InquiriesTable";
import { Pagination } from "@/components/admin/Pagination";
import type { InquiryStatus } from "@/lib/supabase/rows";

export const metadata: Metadata = { title: `${admin.list.title} – Admin` };

const STATUS_VALUES: InquiryStatus[] = ["neu", "in_bearbeitung", "beantwortet", "abgeschlossen"];

function parseStatus(value: string | undefined): InquiryStatus | "alle" {
  if (value && (STATUS_VALUES as string[]).includes(value)) return value as InquiryStatus;
  return "alle";
}

function parsePage(value: string | undefined): number {
  const n = value ? Number.parseInt(value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const filters: InquiryListFilters = {
    status: parseStatus(one(params.status)),
    familyId: one(params.family) || undefined,
    dateFrom: one(params.from) || undefined,
    dateTo: one(params.to) || undefined,
    search: one(params.q) || undefined,
    page: parsePage(one(params.page)),
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
