// Baureihen-Detail: Foto, Kurzbeschrieb/Sortierung/aktiv, Modelle mit
// Serien-PS/Nm. Platzhalter-Baureihen (has_pricelist = false) sind
// zusätzlich im Namen editierbar. Siehe docs/architektur.md, Abschnitt
// "Datenmodell" (Admin-Felder photo_url, short_text, sort, series_ps,
// series_nm).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getFamilyDetailForAdmin } from "@/lib/admin/models";
import { admin } from "@/lib/i18n/admin";
import { Toolbar } from "@/components/admin/Toolbar";
import { FamilyPhotoUploader } from "@/components/admin/FamilyPhotoUploader";
import { FamilyMetaForm } from "@/components/admin/FamilyMetaForm";
import { ModelsAdminTable } from "@/components/admin/ModelsAdminTable";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug} – ${admin.models.title} – Admin` };
}

export default async function AdminModelFamilyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;

  const family = await getFamilyDetailForAdmin(slug);
  if (!family) notFound();

  return (
    <>
      <Toolbar
        title={family.name}
        subtitle={[family.brand, !family.hasPricelist ? admin.models.detail.placeholderBadge : null].filter(Boolean).join(" · ")}
        actions={
          <Link href="/admin/modelle" className="text-sm text-red-bright hover:underline">
            {admin.models.detail.back}
          </Link>
        }
      />

      <div className="grid gap-6 md2:grid-cols-2">
        <FamilyPhotoUploader familyId={family.id} familyName={family.name} initialPhotoUrl={family.photoUrl} />
        <FamilyMetaForm
          familyId={family.id}
          familySlug={family.slug}
          hasPricelist={family.hasPricelist}
          initialName={family.name}
          initialShortText={family.shortText}
          initialSort={family.sort}
          initialActive={family.active}
        />
      </div>

      <ModelsAdminTable familySlug={family.slug} models={family.models} />
    </>
  );
}
