"use client";

// Antwortentwurf: Betreff + Textarea, Speichern/Entwurf neu erzeugen/
// Kopieren/Senden (Aufgabenstellung). Senden fragt vorher per ConfirmDialog
// nach und zeigt einen Hinweis auf BCC/Reply-To/Override. Ein
// fehlgeschlagener Versand (z.B. Resend-Sandbox lehnt ab) bleibt als
// Inline-Fehlermeldung sichtbar, zusätzlich zum Toast (Playwright-Test der
// Aufgabenstellung: "Fehler sichtbar").
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { admin } from "@/lib/i18n/admin";
import { tf } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui";
import { regenerateDraftAction, saveDraftAction, sendReplyAction } from "@/app/admin/actions/inquiries";
import { ConfirmDialog } from "./ConfirmDialog";
import { CopyButton } from "./CopyButton";
import { FormField } from "./FormField";
import { Textarea } from "./Textarea";
import { useToast } from "./Toast";

export interface DraftEditorProps {
  inquiryId: string;
  initialSubject: string;
  initialBody: string;
  customerEmail: string | null;
  mailBcc?: string;
  mailReplyTo?: string;
  overrideAddress?: string;
}

export function DraftEditor({
  inquiryId,
  initialSubject,
  initialBody,
  customerEmail,
  mailBcc,
  mailReplyTo,
  overrideAddress,
}: DraftEditorProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setSendError(null);
    startTransition(async () => {
      const result = await saveDraftAction(inquiryId, subject, body);
      if (result.ok) {
        showToast(admin.detail.draft.saved, "success");
      } else {
        showToast(result.error, "error");
      }
    });
  }

  function handleRegenerate() {
    setSendError(null);
    startTransition(async () => {
      const result = await regenerateDraftAction(inquiryId);
      if (result.ok) {
        setSubject(result.subject);
        setBody(result.body);
        showToast(admin.detail.draft.regenerated, "success");
      } else {
        showToast(result.error, "error");
      }
    });
  }

  function handleSendConfirmed() {
    setSendError(null);
    startTransition(async () => {
      const result = await sendReplyAction(inquiryId, subject, body);
      setConfirmOpen(false);
      if (result.ok) {
        showToast(admin.detail.draft.sent, "success");
      } else {
        const message = tf(admin.detail.draft.sendFailed, { error: result.error });
        setSendError(message);
        showToast(message, "error");
      }
      // In beiden Fällen neu laden: sendReplyAction() protokolliert JEDEN
      // Versandversuch in outbound_emails (siehe lib/mail/resend.ts, auch
      // bei einem Fehler), das Mail-Protokoll soll den neuen Eintrag sofort
      // zeigen, nicht erst nach einem manuellen Reload.
      router.refresh();
    });
  }

  return (
    <>
      {/* min-w-0: Flex-Item im flex-col-Container von components/admin/Shell.tsx, siehe Kommentar in components/admin/Card.tsx (Prüfbefund admin-shell, Punkt 3). */}
      <section className="min-w-0 border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            {admin.detail.draft.title}
          </h2>
          <CopyButton
            text={`${subject}\n\n${body}`}
            label={admin.detail.draft.copy}
            copiedMessage={admin.detail.draft.copied}
            failedMessage={admin.detail.draft.copyFailed}
          />
        </div>
        <div className="flex flex-col gap-4 p-5">
          <FormField
            label={admin.detail.draft.subject}
            inputProps={{
              value: subject,
              onChange: (e) => setSubject(e.target.value),
              disabled: pending,
            }}
          />
          <div className="flex flex-col gap-1.5">
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              {admin.detail.draft.body}
            </span>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={pending} />
          </div>

          <div className="flex flex-col gap-1 text-xs text-dim">
            {mailBcc && <p>{tf(admin.detail.draft.hintBcc, { bcc: mailBcc })}</p>}
            {mailReplyTo && <p>{tf(admin.detail.draft.hintReplyTo, { replyTo: mailReplyTo })}</p>}
            {overrideAddress && (
              <p className="text-warn">{tf(admin.detail.draft.hintOverride, { override: overrideAddress })}</p>
            )}
          </div>

          {sendError && (
            <p role="alert" className="text-sm text-red-bright">
              {sendError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="line" size="sm" disabled={pending} onClick={handleRegenerate}>
              {admin.detail.draft.regenerate}
            </Button>
            <Button type="button" variant="line" size="sm" disabled={pending} onClick={handleSave}>
              {admin.detail.draft.save}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={pending || !customerEmail}
              onClick={() => setConfirmOpen(true)}
            >
              {pending ? admin.detail.draft.sending : admin.detail.draft.send}
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title={admin.detail.draft.confirmTitle}
        confirmLabel={admin.detail.draft.confirmSend}
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSendConfirmed}
      >
        <p>{tf(admin.detail.draft.confirmBody, { email: customerEmail ?? "" })}</p>
        {(mailBcc || overrideAddress) && (
          <p className="mt-2 text-xs text-dim">
            {overrideAddress
              ? tf(admin.detail.draft.hintOverride, { override: overrideAddress })
              : mailBcc
                ? tf(admin.detail.draft.hintBcc, { bcc: mailBcc })
                : null}
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
