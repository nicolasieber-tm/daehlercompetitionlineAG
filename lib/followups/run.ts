// Cron-Kern (Posten 6): sendet fällige Follow-ups. Siehe CLAUDE.md,
// Abschnitt "Follow-ups (Posten 6)", und docs/architektur.md, Abschnitt
// "Follow-ups" ("Cron ... sendet fällige, nicht gesendete, nicht
// stornierte Follow-ups, wenn answer_received_at null und Status nicht
// abgeschlossen"). Aufgerufen von app/api/cron/follow-ups/route.ts.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInquiryMail } from "@/lib/mail";
import { vehicleLabel } from "@/lib/mail/render";
import { getSettings } from "@/lib/mail/settings";
import type { Locale, Model, ModelFamily } from "@/lib/supabase/rows";
import { zurichDateString } from "./schedule";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Maximale Anzahl Versandversuche je Follow-up-Eintrag (Prüfer-Befund:
 * "Erwartung laut Auftrag: maximal 3 Versuche"). Wird in claim_follow_up()
 * (supabase/migrations/20260915000000_followups_retry_limit.sql) als
 * DB-seitiger Claim-Guard durchgesetzt; die Konstante hier dient nur der
 * Entscheidung "war das der letzte Versuch?" nach einem Fehlschlag.
 */
export const MAX_FOLLOW_UP_ATTEMPTS = 3;

export type FollowUpOutcome = "sent" | "skipped" | "failed" | "failed_final";

export interface RunDueFollowUpDetail {
  followUpId: string;
  inquiryId: string;
  inquiryNumber: string | null;
  ruleId: string | null;
  outcome: FollowUpOutcome;
  /** Grund bei "skipped" (z.B. "answer_received", "abgeschlossen", "no_email"). */
  reason?: string;
  /** Fehlertext bei "failed"/"failed_final". */
  error?: string;
}

export interface RunDueFollowUpsResult {
  sent: number;
  skipped: number;
  failed: number;
  details: RunDueFollowUpDetail[];
}

// Eingebettete Zeile aus der select()-Query unten. PostgREST liefert für
// eine solche Zeichenketten-Query keinen streng getippten Rückgabetyp
// (siehe dasselbe Muster mit "as unknown as {...}" in
// lib/pricelist/diff.ts/queries.ts); hier deshalb bewusst nur die
// tatsächlich gelesenen Felder als eigener Typ, statt der vollen Row-Typen.
interface DueFollowUpRow {
  id: string;
  inquiry_id: string;
  rule_id: string | null;
  scheduled_for: string;
  inquiries: {
    id: string;
    number: string;
    status: string;
    answer_received_at: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    locale: string;
    vehicle_text: string | null;
    model_families: Pick<ModelFamily, "brand" | "name" | "codes"> | null;
    models: Pick<Model, "name"> | null;
  } | null;
  follow_up_rules: { id: string; subject: string; body: string; active: boolean } | null;
}

/** Storniert genau einen follow_ups-Eintrag (Guard: nur wenn noch nicht gesendet). */
async function cancelFollowUp(admin: Admin, followUpId: string): Promise<void> {
  const { error } = await admin
    .from("follow_ups")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", followUpId)
    .is("sent_at", null);
  if (error) {
    console.error(`runDueFollowUps: Stornieren von ${followUpId} fehlgeschlagen.`, error);
  }
}

interface ClaimedFollowUp {
  /** attempts NACH dem Claim (also inklusive des gerade beginnenden Versuchs). */
  attempts: number;
}

/**
 * Beansprucht einen Eintrag für den Versand, BEVOR die Mail verschickt wird
 * (Aufgabenstellung: "Update mit where sent_at is null als Guard vor dem
 * Versand"): setzt sent_at UND erhöht attempts atomar in einem einzigen
 * UPDATE, über die Postgres-Funktion claim_follow_up() (siehe
 * supabase/migrations/20260915000000_followups_retry_limit.sql) - ein
 * "erst zählen, dann schreiben" in der App-Schicht wäre hier nicht atomar.
 * Der Guard ist erfüllt (Zeile wird zurückgegeben), nur wenn sent_at,
 * cancelled_at und failed_at alle noch null sind UND attempts noch unter
 * MAX_FOLLOW_UP_ATTEMPTS liegt. Nur dann wird anschliessend tatsächlich
 * gesendet - das verhindert sowohl einen doppelten Versand, falls
 * runDueFollowUps() zweimal überlappend läuft, als auch einen Versuch über
 * das Limit hinaus (Prüfer-Befund: unbegrenzte Wiederholungen). Schlägt der
 * Versand danach fehl, wird der Claim über recordFollowUpFailure()
 * ausgewertet: unter dem Limit wird sent_at wieder zurückgenommen (nächster
 * Lauf versucht es erneut), am Limit wird failed_at gesetzt (endgültig
 * aufgegeben).
 *
 * Prüfung Phase B, Punkt 4: das Limit stand bisher an zwei Stellen (die
 * TS-Konstante MAX_FOLLOW_UP_ATTEMPTS hier UND ein hart codiertes "attempts
 * < 3" innerhalb von claim_follow_up() in der Migration), die bei einer
 * künftigen Änderung des Limits leicht auseinanderlaufen. Die Konstante
 * wird deshalb als Parameter an die DB-Funktion übergeben (siehe
 * supabase/migrations/20260916000000_followups_and_imports_phase_b.sql,
 * claim_follow_up(p_id, p_max_attempts)); die einzige Quelle für das Limit
 * bleibt MAX_FOLLOW_UP_ATTEMPTS hier.
 */
async function claimFollowUp(admin: Admin, followUpId: string): Promise<ClaimedFollowUp | null> {
  const { data, error } = await admin.rpc("claim_follow_up", {
    p_id: followUpId,
    p_max_attempts: MAX_FOLLOW_UP_ATTEMPTS,
  });
  if (error) {
    throw new Error(`runDueFollowUps: Beanspruchen von ${followUpId} fehlgeschlagen: ${error.message}`);
  }
  const row = (data ?? [])[0];
  return row ? { attempts: row.attempts } : null;
}

/**
 * Wertet einen fehlgeschlagenen Versandversuch aus: nimmt den Claim zurück
 * (sent_at wieder null) und protokolliert den Fehler (last_error). War das
 * bereits der MAX_FOLLOW_UP_ATTEMPTS-te Versuch (attemptsAfterClaim, von
 * claimFollowUp() zurückgegeben), wird zusätzlich failed_at gesetzt: der
 * Eintrag gilt dann als endgültig aufgegeben und taucht in der
 * Fällig-Abfrage nicht mehr auf (Prüfer-Befund: sonst unbegrenzte
 * Wiederholungen bei dauerhaften Fehlern, z.B. fehlendes RESEND_API_KEY).
 * Gibt zurück, ob es der letzte Versuch war.
 */
async function recordFollowUpFailure(
  admin: Admin,
  followUpId: string,
  attemptsAfterClaim: number,
  errorMessage: string,
): Promise<boolean> {
  const isFinal = attemptsAfterClaim >= MAX_FOLLOW_UP_ATTEMPTS;
  const { error } = await admin
    .from("follow_ups")
    .update({
      sent_at: null,
      last_error: errorMessage,
      ...(isFinal ? { failed_at: new Date().toISOString() } : {}),
    })
    .eq("id", followUpId);
  if (error) {
    console.error(`runDueFollowUps: Fehlerprotokoll für ${followUpId} fehlgeschlagen.`, error);
  }
  return isFinal;
}

async function linkOutboundEmail(admin: Admin, followUpId: string, outboundEmailId: string): Promise<void> {
  const { error } = await admin.from("follow_ups").update({ outbound_email_id: outboundEmailId }).eq("id", followUpId);
  if (error) {
    console.error(`runDueFollowUps: Verknüpfen von outbound_email_id für ${followUpId} fehlgeschlagen.`, error);
  }
}

/**
 * Lädt fällige Follow-ups (scheduled_for <= today, sent_at null,
 * cancelled_at null, failed_at null) mit Anfrage und Regel, sendet sie über
 * sendInquiryMail("follow_up", ...) und protokolliert das Ergebnis.
 * Bricht bei einem einzelnen Fehler nicht ab (Fehler werden gesammelt,
 * inklusive eines Fehlers beim Claim selbst, siehe claimFollowUp()-Aufruf
 * unten, Prüfung Phase B Punkt 4). Nach MAX_FOLLOW_UP_ATTEMPTS erfolglosen
 * Versuchen wird ein Eintrag endgültig aufgegeben (failed_at gesetzt,
 * outcome "failed_final") und taucht danach nicht mehr in dieser Abfrage
 * auf (Prüfer-Befund: vorher unbegrenzte tägliche Wiederholungen bei
 * dauerhaften Fehlern). Eine zur Laufzeit (nach dem Planen) deaktivierte
 * Regel storniert den Eintrag statt zu senden (Prüfung Phase B Punkt 4).
 *
 * `today` optional, Standard: jetzt. Der Vergleich mit scheduled_for läuft
 * über den Kalendertag in Europe/Zurich (siehe lib/followups/schedule.ts,
 * zurichDateString): dieselbe Zeitbasis wie beim Planen.
 */
export async function runDueFollowUps(today: Date = new Date()): Promise<RunDueFollowUpsResult> {
  const admin = createAdminClient();
  const todayStr = zurichDateString(today);

  const { data, error } = await admin
    .from("follow_ups")
    .select(
      "id, inquiry_id, rule_id, scheduled_for, " +
        "inquiries(id, number, status, answer_received_at, first_name, last_name, email, locale, vehicle_text, " +
        "model_families(brand, name, codes), models(name)), " +
        "follow_up_rules(id, subject, body, active)",
    )
    .lte("scheduled_for", todayStr)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .is("failed_at", null)
    .order("scheduled_for", { ascending: true });
  if (error) {
    throw new Error(`runDueFollowUps: fällige Follow-ups konnten nicht geladen werden: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as DueFollowUpRow[];
  const result: RunDueFollowUpsResult = { sent: 0, skipped: 0, failed: 0, details: [] };

  // Prüfung Phase B, Punkt 6: Firmenname aus settings.mail_from_name
  // (companyName), nicht aus company_address (das ist nur noch die
  // optionale Adresse, siehe lib/mail/templates/follow_up.ts).
  let signature: { signatureName: string; companyName: string; companyAddress: string; signaturePhone: string };
  try {
    const settings = await getSettings();
    signature = {
      signatureName: settings.signature_name ?? "",
      companyName: settings.mail_from_name ?? "",
      companyAddress: settings.company_address ?? "",
      signaturePhone: settings.signature_phone ?? "",
    };
  } catch (err) {
    console.error("runDueFollowUps: settings konnten nicht geladen werden, verwende leere Signatur.", err);
    signature = { signatureName: "", companyName: "", companyAddress: "", signaturePhone: "" };
  }

  for (const row of rows) {
    const inquiry = row.inquiries;
    const rule = row.follow_up_rules;

    if (!inquiry) {
      await cancelFollowUp(admin, row.id);
      result.skipped += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: row.inquiry_id,
        inquiryNumber: null,
        ruleId: row.rule_id,
        outcome: "skipped",
        reason: "inquiry_missing",
      });
      continue;
    }

    if (inquiry.answer_received_at || inquiry.status === "abgeschlossen") {
      await cancelFollowUp(admin, row.id);
      result.skipped += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.number,
        ruleId: row.rule_id,
        outcome: "skipped",
        reason: inquiry.answer_received_at ? "answer_received" : "abgeschlossen",
      });
      continue;
    }

    if (!rule) {
      // rule_id hat "on delete set null" (Migration): die Regel wurde
      // gelöscht. Ohne Regel gibt es keinen Text mehr zum Versenden, der
      // Eintrag kann nie mehr fällig abgearbeitet werden -> stornieren
      // statt endlos jeden Tag erneut zu versuchen.
      await cancelFollowUp(admin, row.id);
      result.skipped += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.number,
        ruleId: row.rule_id,
        outcome: "skipped",
        reason: "rule_missing",
      });
      continue;
    }

    if (!rule.active) {
      // Prüfung Phase B, Punkt 4: die Regel wurde nach dem Planen (siehe
      // lib/followups/schedule.ts) im Admin deaktiviert. Ohne aktive Regel
      // soll laut Aufgabenstellung nicht mehr gesendet werden - stornieren
      // statt (wie bei einer gelöschten Regel oben) endlos jeden Tag erneut
      // zu versuchen oder den veralteten Text trotzdem zu verschicken.
      await cancelFollowUp(admin, row.id);
      result.skipped += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.number,
        ruleId: rule.id,
        outcome: "skipped",
        reason: "rule_inactive",
      });
      continue;
    }

    if (!inquiry.email) {
      // Eine Anfrage ohne E-Mail-Adresse kann per Definition nie erfolgreich
      // zugestellt werden - kein Wiederholungsfall, deshalb sofort
      // stornieren statt bei jedem Lauf erneut als "failed" zu melden
      // (Prüfer-Befund).
      await cancelFollowUp(admin, row.id);
      result.skipped += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.number,
        ruleId: rule.id,
        outcome: "skipped",
        reason: "no_email",
      });
      continue;
    }

    // Prüfung Phase B, Punkt 4: ein Fehler beim Claim selbst (z.B. RPC-
    // Fehler) darf den ganzen Lauf nicht abbrechen (bisher ungefangen, warf
    // aus claimFollowUp() direkt aus der for-Schleife heraus und liess alle
    // noch nicht bearbeiteten Einträge dieses Laufs aus) - wie ein
    // fehlgeschlagener Versand als "failed" zählen und mit der nächsten
    // Zeile weitermachen.
    let claimed: ClaimedFollowUp | null;
    try {
      claimed = await claimFollowUp(admin, row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`runDueFollowUps: Claim von ${row.id} fehlgeschlagen.`, err);
      result.failed += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.number,
        ruleId: rule.id,
        outcome: "failed",
        error: message,
      });
      continue;
    }
    if (!claimed) {
      // Zwischenzeitlich von einem anderen Lauf gesendet oder storniert
      // (z.B. "Antwort erhalten" parallel zum Cron) - nicht doppelt zählen.
      result.skipped += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.number,
        ruleId: rule.id,
        outcome: "skipped",
        reason: "already_claimed",
      });
      continue;
    }

    try {
      const label = vehicleLabel({
        family: inquiry.model_families as ModelFamily | null,
        model: inquiry.models as Model | null,
        vehicleText: inquiry.vehicle_text,
      });
      const locale: Locale = inquiry.locale === "en" ? "en" : "de";

      const mailResult = await sendInquiryMail("follow_up", {
        inquiry: {
          id: inquiry.id,
          first_name: inquiry.first_name,
          last_name: inquiry.last_name,
          number: inquiry.number,
          email: inquiry.email,
        },
        vehicleLabel: label,
        rule: { subject: rule.subject, body: rule.body },
        settings: signature,
        locale,
      });

      if (!mailResult.ok) {
        const isFinal = await recordFollowUpFailure(admin, row.id, claimed.attempts, mailResult.error ?? "");
        await linkOutboundEmail(admin, row.id, mailResult.outboundEmailId);
        result.failed += 1;
        result.details.push({
          followUpId: row.id,
          inquiryId: inquiry.id,
          inquiryNumber: inquiry.number,
          ruleId: rule.id,
          outcome: isFinal ? "failed_final" : "failed",
          error: mailResult.error,
        });
        continue;
      }

      await linkOutboundEmail(admin, row.id, mailResult.outboundEmailId);
      result.sent += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.number,
        ruleId: rule.id,
        outcome: "sent",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isFinal = await recordFollowUpFailure(admin, row.id, claimed.attempts, message);
      result.failed += 1;
      result.details.push({
        followUpId: row.id,
        inquiryId: inquiry.id,
        inquiryNumber: inquiry.number,
        ruleId: rule.id,
        outcome: isFinal ? "failed_final" : "failed",
        error: message,
      });
    }
  }

  return result;
}
