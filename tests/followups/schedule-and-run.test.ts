// DB-Tests für lib/followups/schedule.ts und lib/followups/run.ts gegen den
// lokalen Postgres (siehe docs/db.md), Resend gemockt (kein echter Versand,
// gleiches Muster wie tests/mail/resend.test.ts).
//
// Bewusst EINE Datei statt zwei: scheduleFollowUps() liest beim Planen ALLE
// aktiven follow_up_rules (kein Filter auf eine bestimmte Regel, siehe
// lib/followups/schedule.ts) und runDueFollowUps() liest ALLE fälligen
// follow_ups über die gesamte Tabelle (kein Filter auf eine Anfrage, siehe
// lib/followups/run.ts) - beides ist so von der Aufgabenstellung
// vorgegeben (Cron für die gesamte DB). Zwei Testdateien liefen unter
// Vitest parallel in getrennten Workern gegen dieselbe lokale DB und
// haben sich dadurch gegenseitig verfälscht (von einer anderen Datei
// gerade aktiv gesetzte/gelöschte Testregeln tauchten in den
// scheduleFollowUps()-Aufrufen dieser Datei auf, teils mit einem
// Fremdschlüsselfehler, wenn die fremde Regel zwischen dem Laden und dem
// Insert bereits wieder gelöscht wurde). Innerhalb einer Datei laufen
// `it()`-Blöcke garantiert sequentiell (kein `.concurrent`), das behebt es.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  // Regulärer function-Ausdruck statt Arrow-Funktion (siehe
  // tests/mail/resend.test.ts): resend.ts ruft `new Resend(apiKey)` auf,
  // eine Arrow-Funktion kann nicht als Konstruktor verwendet werden.
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: sendMock } };
  }),
}));

import { MAX_FOLLOW_UP_ATTEMPTS, runDueFollowUps } from "@/lib/followups/run";
import {
  cancelOpenFollowUps,
  markAnswerReceived,
  markReplied,
  scheduleFollowUps,
  zurichDateString,
} from "@/lib/followups/schedule";
import { resetResendClient } from "@/lib/mail/resend";
import { clearSettingsCache } from "@/lib/mail/settings";
import { sql, createTestInquiry, createTestRule, deleteTestInquiry, deleteTestRule } from "./support";

// Aufräum-Register: jeder Test trägt seine IDs ein, afterEach räumt auf,
// auch wenn eine Assertion mittendrin fehlschlägt.
let inquiryIds: string[] = [];
let ruleIds: string[] = [];

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: `re_${Math.random().toString(36).slice(2)}` }, error: null });
  resetResendClient();
  clearSettingsCache();
  // tests/setup.ts setzt RESEND_API_KEY global auf "" (kein echter
  // Mailversand in irgendeinem Test). runDueFollowUps()/sendInquiryMail()
  // behandeln das wie "kein Schlüssel gesetzt" (siehe lib/mail/resend.ts)
  // und würden dadurch jeden Versand-Test hier scheitern lassen, obwohl der
  // Resend-Client oben bereits gemockt ist. Ein beliebiger, nicht-leerer
  // Wert genügt (der eine Test, der das MAX_FOLLOW_UP_ATTEMPTS-Limit über
  // einen fehlenden Schlüssel simuliert, löscht die Variable selbst und
  // stellt sie danach wieder her, siehe dort).
  if (!process.env.RESEND_API_KEY) {
    process.env.RESEND_API_KEY = "test-resend-api-key";
  }
});

afterEach(async () => {
  for (const id of inquiryIds) await deleteTestInquiry(id);
  for (const id of ruleIds) await deleteTestRule(id);
  inquiryIds = [];
  ruleIds = [];
});

async function followUpsFor(inquiryId: string) {
  return sql`select * from follow_ups where inquiry_id = ${inquiryId} order by created_at asc`;
}

async function singleFollowUpFor(inquiryId: string) {
  const rows = await followUpsFor(inquiryId);
  expect(rows).toHaveLength(1);
  return rows[0];
}

// ---------------------------------------------------------------------------
// lib/followups/schedule.ts
// ---------------------------------------------------------------------------

describe("scheduleFollowUps", () => {
  it("legt für eine aktive 0-Tage-Regel einen Eintrag mit heutigem Datum (Europe/Zurich) an, inaktive Regel wird übersprungen", async () => {
    const activeRule = await createTestRule({ days_after_reply: 0, active: true, sort: 1 });
    const inactiveRule = await createTestRule({ days_after_reply: 0, active: false, sort: 2 });
    ruleIds.push(activeRule.id, inactiveRule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    const repliedAt = new Date();
    const created = await scheduleFollowUps(inquiry.id, repliedAt);

    expect(created).toHaveLength(1);
    expect(created[0].rule_id).toBe(activeRule.id);
    expect(created[0].scheduled_for).toBe(zurichDateString(repliedAt));

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.rule_id).toBe(activeRule.id);
  });

  it("berechnet scheduled_for als repliedAt + days_after_reply Tage", async () => {
    const rule = await createTestRule({ days_after_reply: 5, active: true });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    const repliedAt = new Date();
    const created = await scheduleFollowUps(inquiry.id, repliedAt);

    const expected = new Date(Date.parse(`${zurichDateString(repliedAt)}T00:00:00Z`) + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(created).toHaveLength(1);
    expect(created[0].scheduled_for).toBe(expected);
  });

  // Prüfung Phase B, Punkt 4: schedule_follow_ups() überspringt eine Regel,
  // für die bereits ein OFFENER Eintrag existiert (weder gesendet noch
  // storniert noch endgültig fehlgeschlagen), statt eine zweite, parallele
  // Planung derselben Regel anzulegen (z.B. wenn die Antwort im Admin ein
  // zweites Mal gesendet wird, bevor der erste Follow-up fällig war). Das
  // ersetzt den früheren Test "respektiert max_count" (der mehrfache
  // scheduleFollowUps()-Aufrufe OHNE etwas dazwischen zu stornieren/senden
  // erwartete - genau das lässt der neue Guard jetzt nicht mehr zu): erst
  // wenn der offene Eintrag storniert/gesendet ist, kann ein weiterer bis
  // max_count angelegt werden; danach (max_count erreicht) auch dann nicht
  // mehr, wenn alle bisherigen Einträge bereits storniert sind.
  it("keine zweite offene Planung derselben Regel, solange ein Eintrag offen ist; max_count zählt trotzdem über die Gesamtzahl", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 2 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    const first = await scheduleFollowUps(inquiry.id, new Date());
    expect(first).toHaveLength(1);

    // Erster Eintrag noch offen: kein zweiter, obwohl max_count (2) das
    // erlauben würde.
    const second = await scheduleFollowUps(inquiry.id, new Date());
    expect(second).toHaveLength(0);
    expect(await followUpsFor(inquiry.id)).toHaveLength(1);

    // Erster Eintrag storniert: jetzt darf der zweite (letzte, max_count=2)
    // Eintrag angelegt werden.
    await cancelOpenFollowUps(inquiry.id, "test");
    const third = await scheduleFollowUps(inquiry.id, new Date());
    expect(third).toHaveLength(1);
    expect(await followUpsFor(inquiry.id)).toHaveLength(2);

    // max_count (2) über die GESAMTZAHL erreicht: auch nach Stornieren des
    // zweiten Eintrags wird kein dritter mehr angelegt.
    await cancelOpenFollowUps(inquiry.id, "test");
    const fourth = await scheduleFollowUps(inquiry.id, new Date());
    expect(fourth).toHaveLength(0);
    expect(await followUpsFor(inquiry.id)).toHaveLength(2);
  });

  // Prüfer-Befund: der max_count-Guard war vorher nicht atomar (erst
  // zählen, dann einfügen). Zwei/drei gleichzeitige markReplied()-Aufrufe
  // für dieselbe Anfrage (z.B. Doppelklick auf "Senden" im Admin, zwei
  // Tabs) legten dadurch mehr Einträge an als max_count erlaubt. Behoben
  // über die Postgres-Funktion schedule_follow_ups() (Advisory-Lock je
  // Anfrage, siehe db/migrations/0001_init.sql).
  it("race: gleichzeitige markReplied()-Aufrufe für dieselbe Anfrage legen nie mehr als max_count Einträge an", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry({ status: "neu" });
    inquiryIds.push(inquiry.id);

    await Promise.all([markReplied(inquiry.id), markReplied(inquiry.id), markReplied(inquiry.id)]);

    const rows = await followUpsFor(inquiry.id);
    expect(rows).toHaveLength(1);
  });
});

describe("cancelOpenFollowUps", () => {
  it("storniert nur offene Einträge (sent_at null, cancelled_at null), ist idempotent", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await scheduleFollowUps(inquiry.id, new Date());
    const before = await singleFollowUpFor(inquiry.id);
    expect(before.cancelled_at).toBeNull();

    const cancelledCount = await cancelOpenFollowUps(inquiry.id, "test");
    expect(cancelledCount).toBe(1);

    const after = await singleFollowUpFor(inquiry.id);
    expect(after.cancelled_at).not.toBeNull();

    // zweiter Aufruf: nichts mehr offen, keine Wirkung
    const secondCancelledCount = await cancelOpenFollowUps(inquiry.id, "test");
    expect(secondCancelledCount).toBe(0);
  });
});

describe("markReplied", () => {
  it("setzt replied_at und status=beantwortet, legt Follow-ups mit korrektem Datum an", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry({ status: "neu" });
    inquiryIds.push(inquiry.id);

    const created = await markReplied(inquiry.id);
    expect(created).toHaveLength(1);
    expect(created[0].scheduled_for).toBe(zurichDateString(new Date()));

    const [updated] = await sql`select replied_at, status from inquiries where id = ${inquiry.id}`;
    expect(updated.status).toBe("beantwortet");
    expect(updated.replied_at).not.toBeNull();

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.rule_id).toBe(rule.id);
  });
});

describe("markAnswerReceived", () => {
  it("setzt answer_received_at und storniert offene Follow-ups", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await scheduleFollowUps(inquiry.id, new Date());

    await markAnswerReceived(inquiry.id);

    const [updated] = await sql`select answer_received_at from inquiries where id = ${inquiry.id}`;
    expect(updated.answer_received_at).not.toBeNull();

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.cancelled_at).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// lib/followups/run.ts
// ---------------------------------------------------------------------------

describe("runDueFollowUps", () => {
  it("sendet einen fälligen Follow-up, setzt sent_at/outbound_email_id, legt outbound_emails (type follow_up) an", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await markReplied(inquiry.id);

    const result = await runDueFollowUps();

    const detail = result.details.find((d) => d.inquiryId === inquiry.id);
    expect(detail?.outcome).toBe("sent");
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(sendMock).toHaveBeenCalled();

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.sent_at).not.toBeNull();
    expect(row.cancelled_at).toBeNull();
    expect(row.outbound_email_id).not.toBeNull();
    const outboundEmailId = row.outbound_email_id as string;

    const [outbound] = await sql`select * from outbound_emails where id = ${outboundEmailId}`;
    expect(outbound.type).toBe("follow_up");
    expect(outbound.status).toBe("sent");
    expect(outbound.inquiry_id).toBe(inquiry.id);
  });

  it("zweiter Lauf: der bereits gesendete Eintrag wird nicht erneut gesendet (idempotent)", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await markReplied(inquiry.id);
    await runDueFollowUps();
    sendMock.mockClear();

    const secondResult = await runDueFollowUps();

    const detail = secondResult.details.find((d) => d.inquiryId === inquiry.id);
    expect(detail).toBeUndefined(); // bereits gesendet -> taucht in der Fällig-Abfrage nicht mehr auf
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("markAnswerReceived vor dem Lauf: der Eintrag wird storniert, nichts wird gesendet", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await markReplied(inquiry.id);
    await markAnswerReceived(inquiry.id);

    const result = await runDueFollowUps();

    const detail = result.details.find((d) => d.inquiryId === inquiry.id);
    expect(detail).toBeUndefined(); // bereits von markAnswerReceived storniert, taucht in der Abfrage nicht mehr auf
    expect(sendMock).not.toHaveBeenCalled();

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.sent_at).toBeNull();
    expect(row.cancelled_at).not.toBeNull();
  });

  it("status abgeschlossen: der fällige Eintrag wird beim Lauf selbst übersprungen und storniert", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await scheduleFollowUps(inquiry.id, new Date());
    await sql`update inquiries set status = 'abgeschlossen' where id = ${inquiry.id}`;

    const result = await runDueFollowUps();

    const detail = result.details.find((d) => d.inquiryId === inquiry.id);
    expect(detail?.outcome).toBe("skipped");
    expect(detail?.reason).toBe("abgeschlossen");
    expect(sendMock).not.toHaveBeenCalled();

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.sent_at).toBeNull();
    expect(row.cancelled_at).not.toBeNull();
  });

  it("noch nicht fällige Einträge (scheduled_for in der Zukunft) werden nicht gesendet", async () => {
    const rule = await createTestRule({ days_after_reply: 30, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await markReplied(inquiry.id);

    const result = await runDueFollowUps();

    const detail = result.details.find((d) => d.inquiryId === inquiry.id);
    expect(detail).toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.sent_at).toBeNull();
    expect(row.cancelled_at).toBeNull();
  });

  // Prüfer-Befund: kein Limit für Wiederholungsversuche. Ein dauerhaft
  // fehlschlagender Follow-up (hier simuliert über ein fehlendes
  // RESEND_API_KEY, wie im Prüferbericht Szenario S6) wurde vorher bei
  // jedem Lauf erneut versucht, unbegrenzt. Erwartung: maximal
  // MAX_FOLLOW_UP_ATTEMPTS (3) Versuche, danach failed_at gesetzt und der
  // Eintrag verschwindet aus der Fällig-Abfrage.
  it("bricht nach MAX_FOLLOW_UP_ATTEMPTS (3) erfolglosen Versuchen ab (failed_at, taucht danach nicht mehr auf)", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await markReplied(inquiry.id);

    const originalApiKey = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      const outcomes: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const result = await runDueFollowUps();
        const detail = result.details.find((d) => d.inquiryId === inquiry.id);
        outcomes.push(detail ? detail.outcome : "not_found");
      }

      // Versuch 1 und 2: "failed" (wird erneut versucht), Versuch 3:
      // "failed_final" (letzter erlaubter Versuch), Versuch 4 und 5: der
      // Eintrag taucht in der Fällig-Abfrage nicht mehr auf.
      expect(outcomes).toEqual(["failed", "failed", "failed_final", "not_found", "not_found"]);
      expect(sendMock).not.toHaveBeenCalled(); // scheitert schon vor dem Resend-Aufruf (kein API-Key)

      const row = await singleFollowUpFor(inquiry.id);
      expect(row.attempts).toBe(MAX_FOLLOW_UP_ATTEMPTS);
      expect(row.sent_at).toBeNull();
      expect(row.failed_at).not.toBeNull();
      expect(row.cancelled_at).toBeNull();
      expect(row.last_error).toContain("RESEND_API_KEY");

      const [{ count }] = await sql<{ count: number }[]>`
        select count(*)::int as count from outbound_emails where inquiry_id = ${inquiry.id} and type = 'follow_up'
      `;
      expect(count).toBe(MAX_FOLLOW_UP_ATTEMPTS); // eine Zeile je tatsächlichem Versuch, nicht 5
    } finally {
      if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = originalApiKey;
    }
  });

  // Prüfer-Befund: eine Anfrage ohne E-Mail-Adresse kann nie erfolgreich
  // sein, wurde vorher aber trotzdem bei jedem Lauf erneut als "failed"
  // gemeldet. Erwartung: sofortiges Stornieren statt Wiederholung.
  it("Anfrage ohne E-Mail-Adresse: wird sofort storniert, kein Versandversuch, kein Wiederholen", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry({ email: null });
    inquiryIds.push(inquiry.id);

    await scheduleFollowUps(inquiry.id, new Date());

    const firstResult = await runDueFollowUps();
    const firstDetail = firstResult.details.find((d) => d.inquiryId === inquiry.id);
    expect(firstDetail?.outcome).toBe("skipped");
    expect(firstDetail?.reason).toBe("no_email");
    expect(sendMock).not.toHaveBeenCalled();

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.sent_at).toBeNull();
    expect(row.cancelled_at).not.toBeNull();
    expect(row.attempts).toBe(0);

    const secondResult = await runDueFollowUps();
    const secondDetail = secondResult.details.find((d) => d.inquiryId === inquiry.id);
    expect(secondDetail).toBeUndefined(); // bereits storniert, taucht nicht mehr in der Abfrage auf
  });

  // Prüfung Phase B, Punkt 4: eine Regel, die NACH dem Planen (zur
  // Laufzeit) im Admin deaktiviert wurde, soll den Eintrag stornieren statt
  // trotzdem zu senden.
  it("deaktivierte Regel zur Laufzeit: der fällige Eintrag wird storniert statt gesendet", async () => {
    const rule = await createTestRule({ days_after_reply: 0, active: true, max_count: 1 });
    ruleIds.push(rule.id);
    const inquiry = await createTestInquiry();
    inquiryIds.push(inquiry.id);

    await scheduleFollowUps(inquiry.id, new Date());

    await sql`update follow_up_rules set active = false where id = ${rule.id}`;

    const result = await runDueFollowUps();
    const detail = result.details.find((d) => d.inquiryId === inquiry.id);
    expect(detail?.outcome).toBe("skipped");
    expect(detail?.reason).toBe("rule_inactive");
    expect(sendMock).not.toHaveBeenCalled();

    const row = await singleFollowUpFor(inquiry.id);
    expect(row.sent_at).toBeNull();
    expect(row.cancelled_at).not.toBeNull();
    expect(row.attempts).toBe(0);
  });
});
