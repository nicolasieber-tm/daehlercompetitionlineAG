"use client";

// Status-Select mit sofortigem Speichern, plus "Antwort erhalten" und
// "Abschliessen" (Aufgabenstellung, Kopf der Detailseite). Jede Aktion
// aktualisiert sofort über eine Server Action und liest die Seite danach
// per router.refresh() neu (zeigt z.B. auch aktualisierte Follow-ups/
// Mail-Protokoll, falls diese Aktion sie beeinflusst hat).
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/i18n/format";
import { Button } from "@/components/ui";
import { markAnswerReceivedAction, markCompletedAction, updateInquiryStatusAction } from "@/app/admin/actions/inquiries";
import type { InquiryStatus } from "@/lib/db/rows";
import { useToast } from "./Toast";

const STATUS_OPTIONS: InquiryStatus[] = ["neu", "in_bearbeitung", "beantwortet", "abgeschlossen"];

export function StatusControl({
  inquiryId,
  status,
  answerReceivedAt,
}: {
  inquiryId: string;
  status: InquiryStatus;
  answerReceivedAt: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();

  function handleStatusChange(next: InquiryStatus) {
    if (next === status) return;
    startTransition(async () => {
      const result = await updateInquiryStatusAction(inquiryId, next);
      if (result.ok) {
        showToast(admin.detail.statusSaved, "success");
        router.refresh();
      } else {
        showToast(result.error, "error");
      }
    });
  }

  function handleAnswerReceived() {
    startTransition(async () => {
      await markAnswerReceivedAction(inquiryId);
      router.refresh();
    });
  }

  function handleComplete() {
    startTransition(async () => {
      await markCompletedAction(inquiryId);
      showToast(admin.detail.completeDone, "success");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        <span className="font-display text-xs font-semibold uppercase tracking-[0.1em] text-muted">
          {admin.detail.statusLabel}
        </span>
        <select
          value={status}
          disabled={pending}
          onChange={(e) => handleStatusChange(e.target.value as InquiryStatus)}
          className="rounded-[2px] border border-line-alt bg-bg px-2.5 py-2 text-sm text-text"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {admin.status[s]}
            </option>
          ))}
        </select>
      </label>

      {answerReceivedAt ? (
        <span className="text-xs text-ok">
          {tf(admin.detail.markAnswerReceivedDone, { date: formatDate(new Date(answerReceivedAt), "de") })}
        </span>
      ) : (
        <Button type="button" variant="line" size="sm" disabled={pending} onClick={handleAnswerReceived}>
          {admin.detail.markAnswerReceived}
        </Button>
      )}

      {status !== "abgeschlossen" && (
        <Button type="button" variant="line" size="sm" disabled={pending} onClick={handleComplete}>
          {admin.detail.complete}
        </Button>
      )}
    </div>
  );
}
