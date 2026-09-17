// createInquiry() gegen die lokale DB mit echtem Katalog (Erstbefüllung,
// siehe docs/db.md): M2 G87 / M2 mit 3 Produkten. Resend gemockt (wie
// tests/mail/resend.test.ts), DB-Schreibzugriffe sind echt. Räumt die
// erzeugte Test-Anfrage und ihre outbound_emails am Ende wieder auf,
// inquiry_counters bleibt unangetastet (siehe Aufgabenstellung).
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function MockResend() {
    return { emails: { send: sendMock } };
  }),
}));

import { sql } from "@/lib/db/client";
import { createInquiry, InvalidSelectionError } from "@/lib/inquiry/create";
import { buildMailContext } from "@/lib/inquiry/context";
import type { InquiryPayload } from "@/lib/inquiry/schema";

let familyId: string;
let modelId: string;
let otherFamilyProductId: string; // Produkt einer ANDEREN Familie, für den Ungültig-Test
let motorProductId: string;
let auspuffProductId: string;
let fahrwerkProductId: string;

beforeAll(async () => {
  sendMock.mockResolvedValue({ data: { id: "test-resend-id" }, error: null });

  const [family] = await sql<{ id: string }[]>`select id from model_families where slug = 'm2-g87'`;
  familyId = family.id;

  const [model] = await sql<{ id: string }[]>`
    select id from models where family_id = ${familyId} and slug = 'm2'
  `;
  modelId = model.id;

  // Reale, dokumentierte M2 G87 Produkte (siehe docs/db.md "M2 G87"),
  // gesucht über category/variant_group/Preis- bzw. Leistungswerte statt
  // per exaktem Namensvergleich: die Excel-Quelle enthält in diesen Namen
  // geschützte Leerzeichen (U+00A0, z.B. zwischen "Basis" und "480"), ein
  // im Testcode getippter normaler Leerzeichen-String matcht das nicht
  // (siehe Bericht) - die numerischen/Enum-Felder sind eindeutig und robust.
  // active = true (Rückmeldung erster Klicktest, CLAUDE.md Abschnitt
  // "AUFGABE": U+00A0 wird jetzt beim Import selbst normalisiert, siehe
  // lib/pricelist/parser.ts) ist Pflicht: der einmalige Re-Import, der die
  // NBSP-Zeichen aus den Namen entfernt, kann den alten (NBSP-behafteten)
  // Datensatz nicht per content_hash/article_no+name/name+category
  // wiedererkennen (der Name selbst hat sich ja geändert) und legt
  // stattdessen eine neue Zeile an, die alte bleibt als inaktives Duplikat
  // mit denselben ps_to/nm_to/price_total-Werten stehen - ohne den Filter
  // liefert die Abfrage dann mehrere statt genau einer Zeile.
  const [[motor], [auspuff], [fahrwerk]] = await Promise.all([
    sql<{ id: string }[]>`
      select id from products where family_id = ${familyId} and category = 'motor'
        and variant_group = 'leistung' and ps_to = 620 and nm_to = 740 and active = true
    `,
    sql<{ id: string }[]>`
      select id from products where family_id = ${familyId} and category = 'auspuff'
        and variant_group = 'anlage' and price_total = 5260 and active = true
    `,
    sql<{ id: string }[]>`
      select id from products where family_id = ${familyId} and category = 'fahrwerk'
        and variant_group = 'fahrwerk' and price_total = 1630 and active = true
    `,
  ]);
  motorProductId = motor.id;
  auspuffProductId = auspuff.id;
  fahrwerkProductId = fahrwerk.id;

  // Ein beliebiges Produkt einer anderen Familie (3er G20, G21, siehe
  // docs/db.md), um "ungültiges Produkt (aus anderer Familie)" zu testen.
  const [otherFamily] = await sql<{ id: string }[]>`select id from model_families where slug = '3er-g20-g21'`;
  if (!otherFamily) throw new Error("Testvoraussetzung: Familie 3er-g20-g21 nicht gefunden.");
  const [otherProduct] = await sql<{ id: string }[]>`
    select id from products where family_id = ${otherFamily.id} and active = true limit 1
  `;
  otherFamilyProductId = otherProduct.id;
});

function basePayload(overrides: Partial<InquiryPayload> = {}): InquiryPayload {
  return {
    locale: "de",
    familyId,
    modelId,
    vehicleText: null,
    year: "2025",
    beenHere: false,
    gearbox: "manual",
    line: null,
    seriesPs: 480,
    categories: ["motor", "auspuff", "fahrwerk"],
    consulting: false,
    selections: [{ productId: motorProductId }, { productId: auspuffProductId }, { productId: fahrwerkProductId }],
    followUpAnswers: { motor: "beides" },
    character: "sportlich",
    timing: "m1_2",
    firstName: "Max",
    lastName: `Testkunde-${randomUUID().slice(0, 8)}`,
    city: "Thun",
    phone: "079 123 45 67",
    email: `test-${randomUUID()}@example.com`,
    channel: "whatsapp",
    message: "",
    privacyAccepted: true,
    ...overrides,
  };
}

const createdInquiryIds: string[] = [];

afterAll(async () => {
  for (const id of createdInquiryIds) {
    await sql`delete from outbound_emails where inquiry_id = ${id}`;
    await sql`delete from inquiries where id = ${id}`;
  }
  // inquiry_counters bleibt bewusst unangetastet (siehe Aufgabenstellung:
  // "inquiry_counters nicht zurücksetzen").
});

describe("createInquiry: M2 G87 / M2 mit 3 Produkten (echter Katalog)", () => {
  it("legt die Anfrage an: Nummer, Richtsumme, Prüfhinweise, Positionen, Mails", async () => {
    const result = await createInquiry(basePayload(), { source: "web", sendCustomerMail: true });
    createdInquiryIds.push(result.id);

    expect(result.number).toMatch(/^\d{4}-\d{4,}$/);
    expect(result.estimatedTotal).toBe(4180 + 5260 + 1630);
    // "motor_und_auspuff" aus der Aufgabenstellung entspricht der
    // tatsächlichen checks.*-ID aus lib/i18n (siehe lib/rules/checks.ts):
    // motor_auspuff_compat, gesetzt bei gewähltem Motor UND Auspuff.
    expect(result.checks.map((c) => c.id)).toContain("motor_auspuff_compat");
    expect(result.draft.subject).toContain(result.number);
    expect(result.draft.body.length).toBeGreaterThan(0);
    expect(result.shareToken).toHaveLength(22);
    // Prüfung, Befund 4: DraftSettings.companyName (settings.mail_from_name)
    // wird jetzt mitgeliefert - die Signatur zeigt den Firmennamen einmal
    // (companyLine() dedupliziert gegen settings.company_address, das im
    // Seed bereits mit dem Namen beginnt: "dÄHLer Competition Line AG,
    // Belp"), nicht doppelt. signature_phone selbst wird hier bewusst nicht
    // geprüft (settings ist DB-Stand, nicht Testfixture) - lib/inquiry/
    // draft.test.ts deckt buildDraft()/companyLine() bereits vollständig
    // mit festen Fixtures ab.
    expect(result.draft.body).toContain("dÄHLer Competition Line AG, Belp · ");
    expect(result.draft.body).not.toContain("dÄHLer Competition Line AG, dÄHLer Competition Line AG");

    const [inquiry] = await sql`select * from inquiries where id = ${result.id}`;

    expect(inquiry.number).toBe(result.number);
    expect(inquiry.estimated_total).toBe(4180 + 5260 + 1630);
    expect(inquiry.share_token).toBe(result.shareToken);
    expect(inquiry.draft_subject).toBe(result.draft.subject);
    expect(inquiry.draft_reply).toBe(result.draft.body);
    // Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
    // die effektiv wirksame Serienleistung wird mitgespeichert (siehe
    // basePayload() oben: seriesPs 480, passend zur Basis-480-Stufe
    // motorProductId).
    expect(inquiry.series_ps).toBe(480);

    const selections = inquiry.selections as unknown as Array<{
      product_id: string;
      category: string;
      price_total: number | null;
      ps_to: number | null;
      nm_to: number | null;
    }>;
    expect(selections).toHaveLength(3);
    expect(selections.map((s) => s.product_id).sort()).toEqual(
      [motorProductId, auspuffProductId, fahrwerkProductId].sort(),
    );
    expect(selections.find((s) => s.product_id === motorProductId)?.price_total).toBe(4180);
    // Prüfung, Befund 4: ps_to/nm_to werden je Position mitgespeichert,
    // damit die ZIEL-Zeile der Inbox-Mail (lib/mail/templates/inbox.ts
    // goalLine()) "ca. 620 PS / 740 Nm" zeigen kann, statt auf
    // products.description zurückzufallen.
    const motorSelection = selections.find((s) => s.product_id === motorProductId);
    expect(motorSelection?.ps_to).toBe(620);
    expect(motorSelection?.nm_to).toBe(740);

    // Dieselben Werte müssen über lib/inquiry/context.ts buildMailContext()
    // (parseItems()) wieder ankommen - das ist der tatsächliche Weg, über
    // den die Mailvorlagen (inbox.ts) an ps_to/nm_to kommen.
    const mailCtx = await buildMailContext(result.id);
    const motorItem = mailCtx.items.find((i) => i.category === "motor");
    expect(motorItem?.ps_to).toBe(620);
    expect(motorItem?.nm_to).toBe(740);

    const outbound = await sql<{ type: string }[]>`select type from outbound_emails where inquiry_id = ${result.id}`;
    const types = outbound.map((o) => o.type).sort();
    expect(types).toEqual(["confirmation", "inbox"]);
  });

  it("lehnt ein Produkt aus einer anderen Familie ab (InvalidSelectionError)", async () => {
    const payload = basePayload({ selections: [{ productId: otherFamilyProductId }] });
    await expect(createInquiry(payload, { source: "web", sendCustomerMail: true })).rejects.toBeInstanceOf(
      InvalidSelectionError,
    );
  });
});
