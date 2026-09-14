"use server";

// Server Actions der Anfrage-Detailseite (app/admin/anfragen/[id]/page.tsx):
// Status setzen, "Antwort erhalten", "Abschliessen", Entwurf speichern/neu
// erzeugen, Antwort senden. Siehe docs/architektur.md, Abschnitt "Admin",
// und die Aufgabenstellung "Admin Teil 1". Jede Funktion prüft zuerst
// requireAdmin() (siehe lib/admin/auth.ts) - ohne Session wirft das einen
// Next-Redirect auf /admin/login, der beim aufrufenden Client transparent
// als Navigation ankommt.
import { requireAdmin } from "@/lib/admin/auth";
import { regenerateDraft as regenerateDraftData, saveDraft as saveDraftData, setInquiryStatus } from "@/lib/admin/inquiries";
import { buildMailContext } from "@/lib/inquiry/context";
import { sendInquiryMail } from "@/lib/mail";
import { markAnswerReceived, markReplied } from "@/lib/followups/schedule";
import type { InquiryStatus } from "@/lib/supabase/rows";

export type ActionResult<T extends object = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

const STATUS_VALUES: readonly InquiryStatus[] = ["neu", "in_bearbeitung", "beantwortet", "abgeschlossen"];

function isInquiryStatus(value: string): value is InquiryStatus {
  return (STATUS_VALUES as readonly string[]).includes(value);
}

export async function updateInquiryStatusAction(inquiryId: string, status: string): Promise<ActionResult> {
  await requireAdmin();
  if (!isInquiryStatus(status)) {
    return { ok: false, error: "Ungültiger Status." };
  }
  try {
    await setInquiryStatus(inquiryId, status);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Status konnte nicht gespeichert werden." };
  }
}

export async function markAnswerReceivedAction(inquiryId: string): Promise<void> {
  await requireAdmin();
  await markAnswerReceived(inquiryId);
}

export async function markCompletedAction(inquiryId: string): Promise<void> {
  await requireAdmin();
  await setInquiryStatus(inquiryId, "abgeschlossen");
}

export async function saveDraftAction(inquiryId: string, subject: string, body: string): Promise<ActionResult> {
  await requireAdmin();
  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  if (!trimmedSubject || !trimmedBody) {
    return { ok: false, error: "Betreff und Text dürfen nicht leer sein." };
  }
  try {
    await saveDraftData(inquiryId, trimmedSubject, trimmedBody);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Entwurf konnte nicht gespeichert werden." };
  }
}

export async function regenerateDraftAction(
  inquiryId: string,
): Promise<ActionResult<{ subject: string; body: string }>> {
  await requireAdmin();
  try {
    const draft = await regenerateDraftData(inquiryId);
    return { ok: true, ...draft };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Entwurf konnte nicht erzeugt werden." };
  }
}

/**
 * Sendet die bearbeitete Antwort (siehe Aufgabenstellung: "«Senden» =
 * sendInquiryMail('reply', ctx mit bearbeitetem Betreff/Text) ->
 * outbound_emails, dann markReplied"). Persistiert Betreff/Text zuerst
 * unabhängig vom Sendeergebnis (auch bei einem fehlgeschlagenen Versand
 * soll draft_reply den zuletzt gesendeten Stand zeigen). markReplied()
 * (Status "beantwortet", Follow-ups planen) läuft NUR bei Erfolg - bei
 * einem Resend-Fehler bleibt der Status unverändert und es werden keine
 * Follow-ups geplant (siehe manueller Testfall der Aufgabenstellung).
 */
export async function sendReplyAction(
  inquiryId: string,
  subject: string,
  body: string,
): Promise<ActionResult<{ resendId?: string }>> {
  await requireAdmin();
  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  if (!trimmedSubject || !trimmedBody) {
    return { ok: false, error: "Betreff und Text dürfen nicht leer sein." };
  }

  await saveDraftData(inquiryId, trimmedSubject, trimmedBody);

  const ctx = await buildMailContext(inquiryId);
  const result = await sendInquiryMail("reply", {
    ...ctx,
    draft: { subject: trimmedSubject, body: trimmedBody },
  });

  if (!result.ok) {
    return { ok: false, error: result.error ?? "Versand fehlgeschlagen." };
  }

  await markReplied(inquiryId);
  return { ok: true, resendId: result.resendId };
}
