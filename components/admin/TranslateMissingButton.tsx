"use client";

// «Fehlende übersetzen»: startet lib/translations/sync.ts translateMissing()
// über die Server Action und meldet das Ergebnis als Toast. Läuft synchron
// (der Admin wartet bewusst), siehe app/admin/actions/translations.ts.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui";
import { translateMissingAction } from "@/app/admin/actions/translations";
import { useToast } from "./Toast";

const t = admin.translations.run;

export function TranslateMissingButton({ missing, apiKeyAvailable }: { missing: number; apiKeyAvailable: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const res = await translateMissingAction();
      if (!res.ok) {
        setError(res.error);
        showToast(tf(t.failed, { error: res.error }), "error");
        return;
      }
      const r = res.result;
      if (r.skipped) {
        showToast(t.noKey, "error");
      } else if (r.missing === 0) {
        showToast(t.nothing, "success");
      } else if (r.rejected > 0 || r.failedBatches > 0) {
        showToast(
          tf(t.doneWithProblems, { translated: r.translated, missing: r.missing, rejected: r.rejected, failed: r.failedBatches }),
          "error",
        );
      } else {
        showToast(tf(t.done, { translated: r.translated, missing: r.missing }), "success");
      }
      if (r.joined) showToast(t.joined, "success");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" onClick={run} disabled={pending || missing === 0 || !apiKeyAvailable}>
        {pending ? t.running : missing > 0 ? tf(t.buttonCount, { count: missing }) : t.button}
      </Button>
      {!apiKeyAvailable ? <span className="text-xs text-dim">{t.noKey}</span> : null}
      {error ? (
        <span role="alert" className="text-xs text-red-bright">
          {error}
        </span>
      ) : null}
    </div>
  );
}
