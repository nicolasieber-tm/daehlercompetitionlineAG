"use client";

// Foto einer Baureihe hochladen/ersetzen/entfernen. Siehe
// app/api/admin/models/photo/route.ts (Storage-Bucket model-photos über
// Service-Role, Pfad families/<slug>.<ext>, max. 8 MB, jpg/png/webp).
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { Button } from "@/components/ui";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";
import { Card } from "./Card";

const t = admin.models.detail.photo;
const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function FamilyPhotoUploader({
  familyId,
  familyName,
  initialPhotoUrl,
}: {
  familyId: string;
  familyName: string;
  initialPhotoUrl: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleFileChosen(file: File | undefined) {
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast(t.wrongType, "error");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size > MAX_SIZE) {
      showToast(t.tooLarge, "error");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("familyId", familyId);
    formData.append("file", file);

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/models/photo", { method: "POST", body: formData });
        const data = (await res.json()) as { ok: boolean; error?: string; photoUrl?: string };
        if (!data.ok) {
          showToast(data.error ?? t.wrongType, "error");
          return;
        }
        setPhotoUrl(data.photoUrl ?? null);
        showToast(t.uploaded, "success");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Upload fehlgeschlagen.", "error");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  function handleRemove() {
    setConfirmRemove(false);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/models/photo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ familyId }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) {
          showToast(data.error ?? "Foto entfernen fehlgeschlagen.", "error");
          return;
        }
        setPhotoUrl(null);
        showToast(t.removed, "success");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Foto entfernen fehlgeschlagen.", "error");
      }
    });
  }

  return (
    <Card title={t.title}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-32 w-48 shrink-0 items-center justify-center overflow-hidden rounded-[2px] border border-line-alt bg-bg">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- externe Storage-URL, next/image-Domain-Konfiguration nicht Teil dieser Aufgabe
            <img src={photoUrl} alt={familyName} className="h-full w-full object-cover" />
          ) : (
            <span className="px-3 text-center text-xs text-dim">{t.none}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs text-dim">{t.hint}</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id="family-photo-input"
            onChange={(e) => handleFileChosen(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="line" size="sm" disabled={pending} onClick={() => inputRef.current?.click()}>
              {pending ? t.uploading : photoUrl ? t.replace : t.upload}
            </Button>
            {photoUrl && (
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmRemove(true)}>
                {t.remove}
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        title={t.remove}
        confirmLabel={t.remove}
        pending={pending}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
