"use client";

// «Fällige jetzt senden»: ruft runDueFollowUps() (lib/followups/run.ts) über
// die Server Action auf und zeigt das Ergebnis (gesendet/übersprungen/
// fehlgeschlagen).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { runDueFollowUpsAction } from "@/app/admin/actions/followups";
import { Button } from "@/components/ui";
import { useToast } from "./Toast";
import { Card } from "./Card";

const t = admin.followups.run;

export function RunDueFollowUpsButton() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [resultText, setResultText] = useState<string | null>(null);

  function handleRun() {
    setResultText(null);
    startTransition(async () => {
      const result = await runDueFollowUpsAction();
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      const { sent, skipped, failed } = result.result;
      setResultText(tf(t.result, { sent, skipped, failed }));
      showToast(tf(t.result, { sent, skipped, failed }), failed > 0 ? "error" : "success");
      router.refresh();
    });
  }

  return (
    <Card title={t.title}>
      <p className="mb-3 text-sm text-muted">{t.description}</p>
      <Button type="button" size="sm" disabled={pending} onClick={handleRun}>
        {pending ? t.running : t.button}
      </Button>
      {resultText && <p className="mt-3 text-sm text-text">{resultText}</p>}
    </Card>
  );
}
