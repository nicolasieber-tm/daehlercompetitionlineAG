"use server";

// Server Actions der Modelle-Detailseite (app/admin/modelle/[slug]/page.tsx):
// Baureihen-Angaben (Kurzbeschrieb, Sortierung, aktiv, bei Platzhaltern auch
// Name) und Modell-Angaben (Serien-PS/Nm, aktiv) speichern. Foto-Upload/
// -Entfernen laufen über app/api/admin/models/photo/route.ts (File-Upload,
// kein Server-Action-geeigneter Payload).
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { updateFamilyMeta, updateModel, type FamilyMetaPatch, type ModelPatch } from "@/lib/admin/models";

export type ActionResult<T extends object = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

export async function updateFamilyMetaAction(
  familyId: string,
  familySlug: string,
  patch: FamilyMetaPatch,
): Promise<ActionResult> {
  await requireAdmin();
  try {
    await updateFamilyMeta(familyId, patch);
    revalidateTag("catalog");
    revalidatePath(`/admin/modelle/${familySlug}`);
    revalidatePath("/admin/modelle");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

export async function updateModelAction(modelId: string, familySlug: string, patch: ModelPatch): Promise<ActionResult> {
  await requireAdmin();
  try {
    await updateModel(modelId, patch);
    revalidateTag("catalog");
    revalidatePath(`/admin/modelle/${familySlug}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}
