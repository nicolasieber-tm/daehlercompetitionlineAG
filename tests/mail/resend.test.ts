// sendMail() gegen einen gemockten Resend-Client (vi.mock("resend")), aber
// mit echten DB-Schreibzugriffen auf outbound_emails (lokaler Postgres,
// siehe docs/db.md): eine Test-Anfrage wird angelegt und am Ende wieder
// gelöscht. Deckt: Override-Verhalten (to/bcc/Betreff-Präfix), BCC ohne
// Override, outbound_emails: Zeile mit finalem Status sent bzw. failed, und den
// Fall ohne RESEND_API_KEY (kein Throw).
//
// .env selbst laden wie scripts/create-admin-users.ts (Node 24, kein
// dotenv-Paket in der freigegebenen Paketliste): vitest lädt .env nicht
// automatisch in process.env.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  // Regulärer function-Ausdruck statt Arrow-Funktion: resend.ts ruft
  // `new Resend(apiKey)` auf, eine Arrow-Funktion kann nicht als Konstruktor
  // verwendet werden.
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: sendMock } };
  }),
}));

import { resetResendClient, sendMail } from "@/lib/mail/resend";
import { clearSettingsCache } from "@/lib/mail/settings";
import { sql } from "@/lib/db/client";

// tests/setup.ts setzt RESEND_API_KEY global auf "" (kein echter Mailversand
// in irgendeinem Test, siehe AUFGABE-Umgebung), läuft aber VOR diesem Modul
// und damit auch vor process.loadEnvFile() oben - ein echter Wert aus .env
// würde hier sonst wieder überschrieben. sendMail() behandelt eine leere
// Zeichenkette wie "kein Schlüssel gesetzt" (siehe lib/mail/resend.ts), die
// meisten Tests hier brauchen aber gerade einen (beliebigen) gesetzten
// Schlüssel, damit sie den (gemockten) Resend-Aufruf überhaupt versuchen -
// der eine Test, der explizit "ohne RESEND_API_KEY" prüft, löscht die
// Variable selbst (siehe unten). Fallback nur, wenn .env wirklich keinen
// Wert liefert, sonst bleibt der lokale echte Wert massgeblich.
const ORIGINAL_ENV = { ...process.env, RESEND_API_KEY: process.env.RESEND_API_KEY || "test-resend-api-key" };

let inquiryId: string;

beforeAll(async () => {
  const [row] = await sql<{ id: string }[]>`
    insert into inquiries (number, share_token, first_name, last_name, email)
    values (${`TEST-${Date.now()}`}, ${randomUUID()}, 'Test', 'Versand', 'kunde@example.com')
    returning id
  `;
  inquiryId = row.id;
});

afterAll(async () => {
  if (inquiryId) {
    // outbound_emails hängt per on-delete-cascade an inquiries, ein
    // explizites Aufräumen ist trotzdem sauberer (keine Altlasten, falls die
    // Reihenfolge der Tests mal geändert wird).
    await sql`delete from outbound_emails where inquiry_id = ${inquiryId}`;
    await sql`delete from inquiries where id = ${inquiryId}`;
  }
});

beforeEach(() => {
  sendMock.mockReset();
  resetResendClient();
  clearSettingsCache();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(async () => {
  await sql`delete from outbound_emails where inquiry_id = ${inquiryId}`;
  process.env = { ...ORIGINAL_ENV };
});

async function getOutboundRow(id: string) {
  const [row] = await sql`select * from outbound_emails where id = ${id}`;
  return row;
}

describe("sendMail", () => {
  it("MAIL_TO_OVERRIDE ersetzt to und bcc, Betreff bekommt Test-Präfix, bcc entfällt", async () => {
    process.env.MAIL_TO_OVERRIDE = "test-override@example.com";
    sendMock.mockResolvedValueOnce({ data: { id: "re_override" }, error: null });

    const result = await sendMail({
      to: "kunde@example.com",
      subject: "Ihre Anfrage",
      html: "<p>Hallo</p>",
      text: "Hallo",
      type: "confirmation",
      inquiryId,
    });

    expect(result.ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe("test-override@example.com");
    expect(call.bcc).toBeUndefined();
    expect(call.subject).toBe("[TEST an kunde@example.com] Ihre Anfrage");

    const row = await getOutboundRow(result.outboundEmailId);
    expect(row.to_email).toBe("test-override@example.com");
    expect(row.status).toBe("sent");
  });

  it("ohne Override: bcc kommt aus settings.mail_bcc, ausser to === bcc", async () => {
    delete process.env.MAIL_TO_OVERRIDE;
    // RESEND_FROM_OVERRIDE: lokal in .env gesetzt, solange die Domain
    // daehler.com bei Resend nicht verifiziert ist (siehe lib/mail/resend.ts).
    // Dieser Test prüft aber gezielt den DB-Fallback settings.mail_from, muss
    // also unabhängig von dieser lokalen Override-Variable laufen.
    delete process.env.RESEND_FROM_OVERRIDE;
    sendMock.mockResolvedValueOnce({ data: { id: "re_bcc_1" }, error: null });

    const result = await sendMail({
      to: "kunde@example.com",
      subject: "Ihre Anfrage",
      html: "<p>Hallo</p>",
      text: "Hallo",
      type: "confirmation",
      inquiryId,
    });

    expect(result.ok).toBe(true);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe("kunde@example.com");
    expect(call.bcc).toBe("info@daehler.com"); // db/seed.sql: mail_bcc
    expect(call.subject).toBe("Ihre Anfrage");
    expect(call.replyTo).toBe("info@daehler.com"); // db/seed.sql: mail_reply_to
    expect(call.from).toContain("anfrage@daehler.com"); // db/seed.sql: mail_from
  });

  it("ohne Override: kein bcc, wenn to bereits die bcc-Adresse ist", async () => {
    delete process.env.MAIL_TO_OVERRIDE;
    sendMock.mockResolvedValueOnce({ data: { id: "re_bcc_2" }, error: null });

    const result = await sendMail({
      to: "info@daehler.com",
      subject: "Neue Anfrage",
      html: "<p>Hallo</p>",
      text: "Hallo",
      type: "inbox",
      inquiryId,
    });

    expect(result.ok).toBe(true);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toBe("info@daehler.com");
    expect(call.bcc).toBeUndefined();
  });

  it("outbound_emails: Zeile mit status sent bei Erfolg, resend_id gesetzt", async () => {
    delete process.env.MAIL_TO_OVERRIDE;
    sendMock.mockResolvedValueOnce({ data: { id: "re_success" }, error: null });

    const result = await sendMail({
      to: "kunde@example.com",
      subject: "Ihre Anfrage",
      html: "<p>Hallo</p>",
      text: "Hallo",
      type: "confirmation",
      inquiryId,
    });

    expect(result).toMatchObject({ ok: true, resendId: "re_success" });

    const row = await getOutboundRow(result.outboundEmailId);
    expect(row.status).toBe("sent");
    expect(row.resend_id).toBe("re_success");
    expect(row.error).toBeNull();
    expect(row.sent_at).not.toBeNull();
  });

  it("outbound_emails: Zeile mit status failed bei Resend-Fehler (z.B. Domain nicht verifiziert)", async () => {
    delete process.env.MAIL_TO_OVERRIDE;
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "The daehler.com domain is not verified.", statusCode: 403, name: "invalid_from_address" },
    });

    const result = await sendMail({
      to: "kunde@example.com",
      subject: "Ihre Anfrage",
      html: "<p>Hallo</p>",
      text: "Hallo",
      type: "confirmation",
      inquiryId,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not verified");

    const row = await getOutboundRow(result.outboundEmailId);
    expect(row.status).toBe("failed");
    expect(row.error).toContain("not verified");
    expect(row.resend_id).toBeNull();
  });

  it("ohne RESEND_API_KEY: Fehler 'RESEND_API_KEY fehlt', Zeile failed, kein Throw", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.MAIL_TO_OVERRIDE;

    const result = await sendMail({
      to: "kunde@example.com",
      subject: "Ihre Anfrage",
      html: "<p>Hallo</p>",
      text: "Hallo",
      type: "confirmation",
      inquiryId,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("RESEND_API_KEY fehlt");
    expect(sendMock).not.toHaveBeenCalled();

    const row = await getOutboundRow(result.outboundEmailId);
    expect(row.status).toBe("failed");
    expect(row.error).toBe("RESEND_API_KEY fehlt");
  });

  it("ohne inquiryId: kein Throw, keine outbound_emails-Zeile, aber Versand läuft", async () => {
    delete process.env.MAIL_TO_OVERRIDE;
    sendMock.mockResolvedValueOnce({ data: { id: "re_no_inquiry" }, error: null });

    const result = await sendMail({
      to: "kunde@example.com",
      subject: "Testversand ohne Anfrage",
      html: "<p>Hallo</p>",
      text: "Hallo",
      type: "confirmation",
      inquiryId: null,
    });

    expect(result.ok).toBe(true);
    expect(result.resendId).toBe("re_no_inquiry");

    const rows = await sql`select id from outbound_emails where subject = 'Testversand ohne Anfrage'`;
    expect(rows).toHaveLength(0);
  });
});
