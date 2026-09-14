"use client";

// Modelle einer Baureihe: Serien-PS/Nm pflegen (mit Vorschlägen aus
// series_ps_suggested als Buttons) und aktiv/inaktiv schalten. Siehe
// lib/admin/models.ts updateModel().
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import type { AdminModelItem } from "@/lib/admin/models";
import { updateModelAction } from "@/app/admin/actions/models";
import { Button } from "@/components/ui";
import { useToast } from "./Toast";
import { Card } from "./Card";
import { Table, TableHead, TableBody, Th, Td } from "./Table";

const t = admin.models.detail.models;

function ModelRow({ familySlug, model }: { familySlug: string; model: AdminModelItem }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [seriesPs, setSeriesPs] = useState(model.seriesPs !== null ? String(model.seriesPs) : "");
  const [seriesNm, setSeriesNm] = useState(model.seriesNm !== null ? String(model.seriesNm) : "");
  const [active, setActive] = useState(model.active);
  const [pending, startTransition] = useTransition();

  function toNumberOrNull(value: string): number | null {
    if (value.trim() === "") return null;
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateModelAction(model.id, familySlug, {
        seriesPs: toNumberOrNull(seriesPs),
        seriesNm: toNumberOrNull(seriesNm),
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
    <tr>
      <Td className="font-semibold">{model.name}</Td>
      <Td>{model.fuel ? admin.models.detail.fuel[model.fuel] : "-"}</Td>
      <Td>
        <div className="flex flex-col gap-1.5">
          <input
            type="number"
            value={seriesPs}
            onChange={(e) => setSeriesPs(e.target.value)}
            className="w-24 rounded-[2px] border border-line-alt bg-bg px-2 py-1.5 text-sm text-text"
          />
          {model.seriesPsSuggested.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] uppercase tracking-[0.06em] text-dim">{t.suggested}:</span>
              {model.seriesPsSuggested.map((ps) => (
                <button
                  key={ps}
                  type="button"
                  onClick={() => setSeriesPs(String(ps))}
                  className="rounded-full border border-line-alt px-2 py-0.5 text-[11px] text-muted hover:border-red-bright hover:text-text"
                >
                  {ps}
                </button>
              ))}
            </div>
          )}
        </div>
      </Td>
      <Td>
        <input
          type="number"
          value={seriesNm}
          onChange={(e) => setSeriesNm(e.target.value)}
          className="w-24 rounded-[2px] border border-line-alt bg-bg px-2 py-1.5 text-sm text-text"
        />
      </Td>
      <Td>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
        </label>
      </Td>
      <Td>{model.productCount}</Td>
      <Td>
        <Button type="button" variant="line" size="sm" disabled={pending} onClick={handleSave}>
          {t.save}
        </Button>
      </Td>
    </tr>
  );
}

export function ModelsAdminTable({ familySlug, models }: { familySlug: string; models: AdminModelItem[] }) {
  return (
    <Card title={t.title}>
      {models.length === 0 ? (
        <p className="text-sm text-muted">{t.empty}</p>
      ) : (
        <Table>
          <TableHead>
            <Th>{t.columns.name}</Th>
            <Th>{t.columns.fuel}</Th>
            <Th>{t.columns.seriesPs}</Th>
            <Th>{t.columns.seriesNm}</Th>
            <Th>{t.columns.active}</Th>
            <Th>{t.columns.products}</Th>
            <Th />
          </TableHead>
          <TableBody>
            {models.map((m) => (
              <ModelRow key={m.id} familySlug={familySlug} model={m} />
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}
