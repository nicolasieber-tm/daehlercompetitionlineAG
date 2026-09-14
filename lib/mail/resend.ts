// Mailversand über Resend inkl. Protokollierung in outbound_emails. Siehe
// docs/architektur.md, Abschnitt "Mail", und CLAUDE.md, Abschnitt
// "Mailversand".
//
// Darf niemals nach aussen werfen: eine Anfrage darf nie an einem Mailfehler
// scheitern (docs/architektur.md, "Anfrage anlegen": "Mailfehler dürfen die
// Anfrage nicht verlieren: Anfrage zuerst speichern, Mailfehler in
// outbound_emails.error"). Jeder Fehlerpfad liefert deshalb { ok: false,
// error } statt zu werfen.
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailType, Locale } from "@/lib/supabase/rows";
import { getSettings } from "./settings";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  type: EmailType;
  inquiryId?: string | null;
  locale?: Locale;
}

export interface SendMailResult {
  ok: boolean;
  resendId?: string;
  error?: string;
  outboundEmailId: string;
}

// Lazy erzeugt: der Resend-Client (und damit jede Prüfung, die der SDK beim
// Konstruieren macht) entsteht erst beim ersten tatsächlichen Versand, nicht
// beim Import dieses Moduls (Tests/Build dürfen ohne RESEND_API_KEY laufen).
let resendClient: Resend | null = null;

function getResendClient(apiKey: string): Resend {
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

/** Nur für Tests: erzwingt beim nächsten Versand einen neuen Resend-Client. */
export function resetResendClient(): void {
  resendClient = null;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const admin = createAdminClient();

  let settings: Record<string, string>;
  try {
    settings = await getSettings();
  } catch (err) {
    settings = {};
    console.error("sendMail: settings konnten nicht geladen werden, verwende Fallbacks.", err);
  }

  const fromName = settings.mail_from_name || "dÄHLer Competition Line AG";
  // RESEND_FROM_OVERRIDE: solange die Domain daehler.com bei Resend nicht
  // verifiziert ist, ersetzt diese Variable nur die Absenderadresse (Standard
  // bei Resend-Testkonten: onboarding@resend.dev), settings.mail_from_name
  // bleibt als Anzeigename bestehen. Siehe .env.example.
  const fromAddress = process.env.RESEND_FROM_OVERRIDE || settings.mail_from || "anfrage@daehler.com";
  const replyTo = settings.mail_reply_to || undefined;

  // MAIL_TO_OVERRIDE: alle Empfänger (to und bcc) werden durch diese Adresse
  // ersetzt. Da danach to === bcc gilt, entfällt bcc automatisch über die
  // ohnehin geltende Regel "bcc nicht setzen, wenn to == bcc" unten, der
  // Betreff bekommt den Test-Präfix mit dem ursprünglichen Empfänger.
  const override = process.env.MAIL_TO_OVERRIDE || undefined;
  const originalTo = input.to;
  const effectiveTo = override || originalTo;
  const bccCandidate = override || settings.mail_bcc || undefined;
  const bcc =
    bccCandidate && bccCandidate.toLowerCase() !== effectiveTo.toLowerCase() ? bccCandidate : undefined;
  const subject = override ? `[TEST an ${originalTo}] ${input.subject}` : input.subject;

  // Zeile in outbound_emails anlegen (status pending), bevor überhaupt
  // versendet wird. Ohne inquiryId (z.B. scripts/mail-test.ts ohne echte
  // Anfrage) gibt es keine Fremdschlüssel-Zeile, das ist kein Fehler: dann
  // wird nur nicht protokolliert, der Versand läuft trotzdem.
  let outboundEmailId: string = randomUUID();
  let hasRow = false;
  if (input.inquiryId) {
    try {
      const { data, error } = await admin
        .from("outbound_emails")
        .insert({
          id: outboundEmailId,
          inquiry_id: input.inquiryId,
          type: input.type,
          to_email: effectiveTo,
          subject,
          body_text: input.text,
          status: "pending",
        })
        .select("id")
        .single();
      if (error) throw error;
      outboundEmailId = data.id;
      hasRow = true;
    } catch (err) {
      console.error("sendMail: outbound_emails-Zeile (pending) konnte nicht angelegt werden.", err);
    }
  }

  async function finish(
    result: { status: "sent"; resendId: string } | { status: "failed"; error: string },
  ): Promise<void> {
    if (!hasRow) return;
    try {
      const update =
        result.status === "sent"
          ? { status: "sent", resend_id: result.resendId, sent_at: new Date().toISOString() }
          : { status: "failed", error: result.error };
      const { error } = await admin.from("outbound_emails").update(update).eq("id", outboundEmailId);
      if (error) throw error;
    } catch (err) {
      console.error("sendMail: outbound_emails-Zeile konnte nicht aktualisiert werden.", err);
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const error = "RESEND_API_KEY fehlt";
    await finish({ status: "failed", error });
    return { ok: false, error, outboundEmailId };
  }

  try {
    const client = getResendClient(apiKey);
    const { data, error } = await client.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: effectiveTo,
      subject,
      html: input.html,
      text: input.text,
      ...(bcc ? { bcc } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
    });

    if (error || !data) {
      const message = error?.message ?? "Unbekannter Fehler beim Versand über Resend.";
      await finish({ status: "failed", error: message });
      return { ok: false, error: message, outboundEmailId };
    }

    await finish({ status: "sent", resendId: data.id });
    return { ok: true, resendId: data.id, outboundEmailId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finish({ status: "failed", error: message });
    return { ok: false, error: message, outboundEmailId };
  }
}
