// Follow-up-Planung (Posten 6). Siehe CLAUDE.md, Abschnitt "Follow-ups
// (Posten 6)", und docs/architektur.md, Abschnitt "Follow-ups":
// scheduleFollowUps() legt beim Senden der Antwort pro aktiver Regel einen
// follow_ups-Eintrag an, cancelOpenFollowUps()/markAnswerReceived() stoppen
// offene Follow-ups (ausschliesslich manuell über "Antwort erhalten",
// CLAUDE.md), markReplied() wird vom Admin beim Senden der Antwort
// aufgerufen.
import { sql } from "@/lib/db/client";
import type { FollowUp, InquiryStatus } from "@/lib/db/rows";

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
 * `schedule_follow_ups` (siehe db/migrations/0001_init.sql), nicht als zwei
 * getrennte Roundtrips (erst zählen, dann einfügen): das wäre nicht atomar,
 * zwei gleichzeitige Aufrufe für dieselbe Anfrage (z.B. Doppelklick auf
 * "Senden" im Admin, zwei Tabs) könnten dadurch mehr Einträge anlegen als
 * max_count erlaubt. Die Datenbankfunktion sperrt die Anfrage für die Dauer
 * der Transaktion (`pg_advisory_xact_lock`), wodurch ein zweiter
 * gleichzeitiger Aufruf wartet statt parallel zu zählen.
 *
 * Zusätzlich überspringt schedule_follow_ups() eine Regel, für die bereits
 * ein OFFENER Eintrag existiert (sent_at, cancelled_at und failed_at alle
 * noch null) - ohne diese Prüfung hätte ein erneuter markReplied()-Aufruf
 * für dieselbe Anfrage (z.B. der Admin sendet die Antwort ein zweites Mal
 * nach, bevor der erste Follow-up fällig war) eine zweite, parallele
 * Planung derselben Regel angelegt, solange max_count noch nicht erreicht
 * war.
 */
export async function scheduleFollowUps(inquiryId: string, repliedAt: Date): Promise<FollowUp[]> {
  return sql<FollowUp[]>`
    select * from schedule_follow_ups(${inquiryId}, ${repliedAt.toISOString()})
  `;
}

/**
 * Storniert alle offenen (sent_at null, cancelled_at null) follow_ups einer
 * Anfrage (cancelled_at = now). `reason` dient nur der Nachvollziehbarkeit
 * im Log: follow_ups hat keine eigene Spalte für den Stornierungsgrund
 * (siehe db/migrations/0001_init.sql, docs/db.md), eine Migration ist
 * ausserhalb dieser Aufgabe. Gibt die Anzahl der stornierten Einträge
 * zurück.
 */
export async function cancelOpenFollowUps(inquiryId: string, reason: string): Promise<number> {
  const cancelled = await sql<{ id: string }[]>`
    update follow_ups
    set cancelled_at = ${new Date().toISOString()}
    where inquiry_id = ${inquiryId} and sent_at is null and cancelled_at is null
    returning id
  `;

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
  await sql`update inquiries set answer_received_at = ${new Date().toISOString()} where id = ${inquiryId}`;
  await cancelOpenFollowUps(inquiryId, "answer_received");
}

/**
 * Wird vom Admin beim Senden der Antwort aufgerufen (docs/architektur.md,
 * Abschnitt "Follow-ups"): setzt replied_at und status=beantwortet, plant
 * danach die Follow-ups anhand derselben Zeitbasis. Gibt die neu angelegten
 * follow_ups-Einträge zurück (siehe scheduleFollowUps()).
 */
export async function markReplied(inquiryId: string): Promise<FollowUp[]> {
  const repliedAt = new Date();
  const status: InquiryStatus = "beantwortet";

  await sql`update inquiries set replied_at = ${repliedAt.toISOString()}, status = ${status} where id = ${inquiryId}`;

  return scheduleFollowUps(inquiryId, repliedAt);
}
