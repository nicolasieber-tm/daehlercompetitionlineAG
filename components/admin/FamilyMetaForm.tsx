"use client";

// Admin-Angaben einer Baureihe: Kurzbeschrieb, Sortierung, aktiv, bei
// Platzhalter-Baureihen (has_pricelist = false) zusätzlich der Name. Siehe
// lib/admin/models.ts updateFamilyMeta().
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { updateFamilyMetaAction } from "@/app/admin/actions/models";
import { Button } from "@/components/ui";
import { FormField } from "./FormField";
import { useToast } from "./Toast";
import { Card } from "./Card";

const t = admin.models.detail.meta;

export function FamilyMetaForm({
  familyId,
  familySlug,
  hasPricelist,
  initialName,
  initialShortText,
  initialSort,
  initialActive,
}: {
  familyId: string;
  familySlug: string;
  hasPricelist: boolean;
  initialName: string;
  initialShortText: string | null;
  initialSort: number;
  initialActive: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState(initialName);
  const [shortText, setShortText] = useState(initialShortText ?? "");
  const [sort, setSort] = useState(String(initialSort));
  const [active, setActive] = useState(initialActive);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    const sortValue = Number.parseInt(sort, 10);
    startTransition(async () => {
      const result = await updateFamilyMetaAction(familyId, familySlug, {
        ...(hasPricelist ? {} : { name: name.trim() }),
        shortText: shortText.trim().length > 0 ? shortText.trim() : null,
        sort: Number.isFinite(sortValue) ? sortValue : initialSort,
        active,
      });
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(t.saved, "success");
      router.refresh();
    });
  }

  return (
    <Card title={t.title}>
      <div className="flex flex-col gap-4">
        {!hasPricelist && (
          <FormField
            label={t.name}
            help={t.nameHint}
            inputProps={{ value: name, onChange: (e) => setName(e.target.value), maxLength: 120 }}
          />
        )}
        <FormField
          label={t.shortText}
          as="textarea"
          inputProps={{ value: shortText, onChange: (e) => setShortText(e.target.value), rows: 3, maxLength: 400 }}
        />
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-32">
            <FormField
              label={t.sort}
              inputProps={{ type: "number", value: sort, onChange: (e) => setSort(e.target.value) }}
            />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-text">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
            {t.active}
          </label>
        </div>
        <div>
          <Button type="button" size="sm" disabled={pending} onClick={handleSubmit}>
            {t.save}
          </Button>
        </div>
      </div>
    </Card>
  );
}
