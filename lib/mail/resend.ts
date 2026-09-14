// Mailversand über Resend inkl. Protokollierung in outbound_emails. Siehe
// docs/architektur.md, Abschnitt "Mail", und CLAUDE.md, Abschnitt
// "Mailversand".
//
// Darf niemals nach aussen werfen: eine Anfrage darf nie an einem Mailfehler
// scheitern (docs/architektur.md, "Anfrage anlegen": "Mailfehler dürfen die
// Anfrage nicht verlieren: Anfrage zuerst speichern, Mailfehler in
// outbound_emails.error"). Jeder Fehlerpfad liefert deshalb { ok: false,
// error } statt zu werfen.
//
// Abweichung vom Auftrag ("Zeile in outbound_emails anlegen (status
// pending), danach status sent/failed"): outbound_emails.status hat in
// supabase/migrations/20260911000000_init.sql die check-Constraint
// `status in ('sent', 'failed')` (Default 'sent'), "pending" ist dort kein
// gültiger Wert (siehe auch docs/db.md und EmailStatus in
// lib/supabase/rows.ts: nur "sent" | "failed"). Migrationen liegen ausserhalb
// dieser Aufgabe. sendMail() ermittelt deshalb das Ergebnis zuerst und
// schreibt danach genau eine Zeile mit dem finalen Status, statt eine
// pending-Zeile vorab anzulegen und anschliessend zu aktualisieren. Siehe
// Bericht.
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

type Outcome = { status: "sent"; resendId: string } | { status: "failed"; error: string };

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  // createAdminClient() wirft bei fehlenden Env-Variablen (siehe
  // lib/supabase/admin.ts). sendMail() darf trotzdem nie nach aussen werfen,
  // deshalb hier abgefangen: ohne Admin-Client ist auch keine
  // outbound_emails-Zeile möglich, das Ergebnis kommt also ohne
  // Protokollzeile zurück (Befund 2).
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sendMail: Admin-Client konnte nicht erstellt werden.", err);
    return { ok: false, error: message, outboundEmailId: randomUUID() };
  }

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

  let outcome: Outcome;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    outcome = { status: "failed", error: "RESEND_API_KEY fehlt" };
  } else {
    try {
      const client = getResendClient(apiKey);
      const { data, error } = await client.emails.send({
        from: `${fromName} <${fromAddress}>`,
        to: effectiveTo,
        subject,
        html: input.html,
        text: input.text,
        bcc,
        replyTo,
      });

      if (error || !data) {
        outcome = { status: "failed", error: error?.message ?? "Unbekannter Fehler beim Versand über Resend." };
      } else {
        outcome = { status: "sent", resendId: data.id };
      }
    } catch (err) {
      outcome = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Protokollzeile anlegen, ohne inquiryId (z.B. scripts/mail-test.ts ohne
  // echte Anfrage) entfällt das (Fremdschlüssel outbound_emails.inquiry_id
  // ist not null), der Versand selbst läuft trotzdem.
  let outboundEmailId: string = randomUUID();
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
          status: outcome.status,
          resend_id: outcome.status === "sent" ? outcome.resendId : null,
          error: outcome.status === "failed" ? outcome.error : null,
          sent_at: outcome.status === "sent" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      outboundEmailId = data.id;
    } catch (err) {
      console.error("sendMail: outbound_emails-Zeile konnte nicht angelegt werden.", err);
    }
  }

  return outcome.status === "sent"
    ? { ok: true, resendId: outcome.resendId, outboundEmailId }
    : { ok: false, error: outcome.error, outboundEmailId };
}
