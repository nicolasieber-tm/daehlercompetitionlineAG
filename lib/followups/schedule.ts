// Follow-up-Planung (Posten 6). Siehe CLAUDE.md, Abschnitt "Follow-ups
// (Posten 6)", und docs/architektur.md, Abschnitt "Follow-ups":
// scheduleFollowUps() legt beim Senden der Antwort pro aktiver Regel einen
// follow_ups-Eintrag an, cancelOpenFollowUps()/markAnswerReceived() stoppen
// offene Follow-ups (ausschliesslich manuell über "Antwort erhalten",
// CLAUDE.md), markReplied() wird vom Admin beim Senden der Antwort
// aufgerufen.
import { createAdminClient } from "@/lib/supabase/admin";
import type { FollowUp, InquiryStatus } from "@/lib/supabase/rows";

/**
 * Kalendertag (YYYY-MM-DD) von `date` in Europe/Zurich, für die `date`-Spalte
 * follow_ups.scheduled_for (siehe docs/db.md: Datumsangaben, die sich auf
 * Schweizer Ortszeit beziehen, z.B. next_inquiry_number(), verwenden
 * durchgehend Europe/Zurich statt Server-/Session-Zeitzone).
 */
export function zurichDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Legt für `inquiryId` pro aktiver Regel (Reihenfolge `sort`) einen
 * follow_ups-Eintrag an, `scheduled_for = repliedAt + rule.days_after_reply`
 * Tage (Europe/Zurich), sofern für diese Anfrage und Regel noch weniger als
 * `rule.max_count` Einträge existieren (alle Einträge zählen, unabhängig von
 * gesendet/storniert: max_count begrenzt, wie oft insgesamt geplant wird).
 * Gibt die neu angelegten Einträge zurück.
 *
 * Die eigentliche Prüfung+Einfügung läuft in der Postgres-Funktion
 * `schedule_follow_ups` (siehe
 * supabase/migrations/20260915000000_followups_retry_limit.sql, ergänzt in
 * supabase/migrations/20260916000000_followups_and_imports_phase_b.sql),
 * nicht mehr hier als zwei getrennte Roundtrips (erst zählen, dann
 * einfügen): das war nicht atomar, zwei gleichzeitige Aufrufe für dieselbe
 * Anfrage (z.B. Doppelklick auf "Senden" im Admin, zwei Tabs) konnten
 * dadurch mehr Einträge anlegen als max_count erlaubt (Prüfer-Befund). Die
 * Datenbankfunktion sperrt die Anfrage für die Dauer der Transaktion
 * (`pg_advisory_xact_lock`), wodurch ein zweiter gleichzeitiger Aufruf
 * wartet statt parallel zu zählen. security definer, Execute-Recht nur für
 * `service_role` (siehe Migration), daher nur über den Admin-Client
 * aufrufbar.
 *
 * Prüfung Phase B, Punkt 4: zusätzlich überspringt schedule_follow_ups()
 * jetzt eine Regel, für die bereits ein OFFENER Eintrag existiert (sent_at,
 * cancelled_at und failed_at alle noch null) - ohne diese Prüfung hätte ein
 * erneuter markReplied()-Aufruf für dieselbe Anfrage (z.B. der Admin sendet
 * die Antwort ein zweites Mal nach, bevor der erste Follow-up fällig war)
 * eine zweite, parallele Planung derselben Regel angelegt, solange
 * max_count noch nicht erreicht war.
 */
export async function scheduleFollowUps(inquiryId: string, repliedAt: Date): Promise<FollowUp[]> {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("schedule_follow_ups", {
    p_inquiry_id: inquiryId,
    p_replied_at: repliedAt.toISOString(),
  });
  if (error) {
    throw new Error(`scheduleFollowUps: Planung fehlgeschlagen: ${error.message}`);
  }
  return data ?? [];
}

/**
 * Storniert alle offenen (sent_at null, cancelled_at null) follow_ups einer
 * Anfrage (cancelled_at = now). `reason` dient nur der Nachvollziehbarkeit
 * im Log: follow_ups hat keine eigene Spalte für den Stornierungsgrund
 * (siehe supabase/migrations/20260911000000_init.sql, docs/db.md), eine
 * Migration ist ausserhalb dieser Aufgabe. Gibt die Anzahl der stornierten
 * Einträge zurück.
 */
export async function cancelOpenFollowUps(inquiryId: string, reason: string): Promise<number> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("follow_ups")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("inquiry_id", inquiryId)
    .is("sent_at", null)
    .is("cancelled_at", null)
    .select("id");
  if (error) {
    throw new Error(`cancelOpenFollowUps: Stornieren fehlgeschlagen: ${error.message}`);
  }

  const cancelled = data ?? [];
  if (cancelled.length > 0) {
    console.info(
      `cancelOpenFollowUps: ${cancelled.length} Follow-up(s) für Anfrage ${inquiryId} storniert (${reason}).`,
    );
  }
  return cancelled.length;
}

/**
 * "Antwort erhalten" im Admin (CLAUDE.md: "Stopp ausschliesslich manuell").
 * Setzt inquiries.answer_received_at und storniert alle offenen Follow-ups.
 */
export async function markAnswerReceived(inquiryId: string): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from("inquiries")
    .update({ answer_received_at: new Date().toISOString() })
    .eq("id", inquiryId);
  if (error) {
    throw new Error(`markAnswerReceived: Anfrage konnte nicht aktualisiert werden: ${error.message}`);
  }

  await cancelOpenFollowUps(inquiryId, "answer_received");
}

/**
 * Wird vom Admin beim Senden der Antwort aufgerufen (docs/architektur.md,
 * Abschnitt "Follow-ups"): setzt replied_at und status=beantwortet, plant
 * danach die Follow-ups anhand derselben Zeitbasis. Gibt die neu angelegten
 * follow_ups-Einträge zurück (siehe scheduleFollowUps()).
 */
export async function markReplied(inquiryId: string): Promise<FollowUp[]> {
  const admin = createAdminClient();
  const repliedAt = new Date();
  const status: InquiryStatus = "beantwortet";

  const { error } = await admin
    .from("inquiries")
    .update({ replied_at: repliedAt.toISOString(), status })
    .eq("id", inquiryId);
  if (error) {
    throw new Error(`markReplied: Anfrage konnte nicht aktualisiert werden: ${error.message}`);
  }

  return scheduleFollowUps(inquiryId, repliedAt);
}
