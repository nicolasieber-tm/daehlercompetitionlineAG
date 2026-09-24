"use client";

// "Löschen" im Kopf der Anfrage-Detailseite: Bestätigungsdialog, dann
// endgültiges Löschen über deleteInquiryAction() und zurück zur Übersicht
// (mit Filtern und Seite, falls gemerkt, siehe BackToOverviewLink.tsx).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui";
import { deleteInquiryAction } from "@/app/admin/actions/inquiries";
import { ConfirmDialog } from "./ConfirmDialog";
import { overviewHref } from "./BackToOverviewLink";
import { useToast } from "./Toast";

export function DeleteInquiryButton({ inquiryId, number }: { inquiryId: string; number: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deleteInquiryAction(inquiryId);
      if (result.ok) {
        showToast(tf(admin.detail.deleteDone, { number }), "success");
        router.replace(overviewHref());
        router.refresh();
      } else {
        setOpen(false);
        showToast(result.error, "error");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="line" size="sm" disabled={pending} onClick={() => setOpen(true)}>
        {admin.detail.delete}
      </Button>
      <ConfirmDialog
        open={open}
        title={tf(admin.detail.deleteConfirmTitle, { number })}
        confirmLabel={admin.detail.deleteConfirm}
        pending={pending}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      >
        {admin.detail.deleteConfirmText}
      </ConfirmDialog>
    </>
  );
}
