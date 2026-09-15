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

import { createAdminClient } from "@/lib/supabase/admin";
import { createInquiry, InvalidSelectionError } from "@/lib/inquiry/create";
import { buildMailContext } from "@/lib/inquiry/context";
import type { InquiryPayload } from "@/lib/inquiry/schema";

const admin = createAdminClient();

let familyId: string;
let modelId: string;
let otherFamilyProductId: string; // Produkt einer ANDEREN Familie, für den Ungültig-Test
let motorProductId: string;
let auspuffProductId: string;
let fahrwerkProductId: string;

beforeAll(async () => {
  sendMock.mockResolvedValue({ data: { id: "test-resend-id" }, error: null });

  const { data: family, error: familyError } = await admin
    .from("model_families")
    .select("id")
    .eq("slug", "m2-g87")
    .single();
  if (familyError) throw familyError;
  familyId = family.id;

  const { data: model, error: modelError } = await admin
    .from("models")
    .select("id")
    .eq("family_id", familyId)
    .eq("slug", "m2")
    .single();
  if (modelError) throw modelError;
  modelId = model.id;

  // Reale, dokumentierte M2 G87 Produkte (siehe docs/db.md "M2 G87"),
  // gesucht über category/variant_group/Preis- bzw. Leistungswerte statt
  // per exaktem Namensvergleich: die Excel-Quelle enthält in diesen Namen
  // geschützte Leerzeichen (U+00A0, z.B. zwischen "Basis" und "480"), ein
  // im Testcode getippter normaler Leerzeichen-String matcht das nicht
  // (siehe Bericht) - die numerischen/Enum-Felder sind eindeutig und robust.
  // .eq("active", true) (Rückmeldung erster Klicktest, CLAUDE.md Abschnitt
  // "AUFGABE": U+00A0 wird jetzt beim Import selbst normalisiert, siehe
  // lib/pricelist/parser.ts) ist Pflicht: der einmalige Re-Import, der die
  // NBSP-Zeichen aus den Namen entfernt, kann den alten (NBSP-behafteten)
  // Datensatz nicht per content_hash/article_no+name/name+category
  // wiedererkennen (der Name selbst hat sich ja geändert) und legt
  // stattdessen eine neue Zeile an, die alte bleibt als inaktives Duplikat
  // mit denselben ps_to/nm_to/price_total-Werten stehen - ohne den Filter
  // liefert .single() dann "mehrere Zeilen" statt genau einer.
  const [{ data: motor, error: motorError }, { data: auspuff, error: auspuffError }, { data: fahrwerk, error: fahrwerkError }] =
    await Promise.all([
      admin
        .from("products")
        .select("id")
        .eq("family_id", familyId)
        .eq("category", "motor")
        .eq("variant_group", "leistung")
        .eq("ps_to", 620)
        .eq("nm_to", 740)
        .eq("active", true)
        .single(),
      admin
        .from("products")
        .select("id")
        .eq("family_id", familyId)
        .eq("category", "auspuff")
        .eq("variant_group", "anlage")
        .eq("price_total", 5260)
        .eq("active", true)
        .single(),
      admin
        .from("products")
        .select("id")
        .eq("family_id", familyId)
        .eq("category", "fahrwerk")
        .eq("variant_group", "fahrwerk")
        .eq("price_total", 1630)
        .eq("active", true)
        .single(),
    ]);
  if (motorError) throw motorError;
  if (auspuffError) throw auspuffError;
  if (fahrwerkError) throw fahrwerkError;
  motorProductId = motor.id;
  auspuffProductId = auspuff.id;
  fahrwerkProductId = fahrwerk.id;

  // Ein beliebiges Produkt einer anderen Familie (3er G20, G21, siehe
  // docs/db.md), um "ungültiges Produkt (aus anderer Familie)" zu testen.
  const { data: otherFamily, error: otherFamilyError } = await admin
    .from("model_families")
    .select("id")
    .eq("slug", "3er-g20-g21")
    .maybeSingle();
  if (otherFamilyError) throw otherFamilyError;
  const otherFamilyId = otherFamily?.id;
  if (!otherFamilyId) throw new Error("Testvoraussetzung: Familie 3er-g20-g21 nicht gefunden.");
  const { data: otherProduct, error: otherProductError } = await admin
    .from("products")
    .select("id")
    .eq("family_id", otherFamilyId)
    .eq("active", true)
    .limit(1)
    .single();
  if (otherProductError) throw otherProductError;
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
    await admin.from("outbound_emails").delete().eq("inquiry_id", id);
    await admin.from("inquiries").delete().eq("id", id);
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

    const { data: inquiry, error } = await admin
      .from("inquiries")
      .select("*")
      .eq("id", result.id)
      .single();
    if (error) throw error;

    expect(inquiry.number).toBe(result.number);
    expect(inquiry.estimated_total).toBe(4180 + 5260 + 1630);
    expect(inquiry.share_token).toBe(result.shareToken);
    expect(inquiry.draft_subject).toBe(result.draft.subject);
    expect(inquiry.draft_reply).toBe(result.draft.body);

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
    const mailCtx = await buildMailContext(result.id, admin);
    const motorItem = mailCtx.items.find((i) => i.category === "motor");
    expect(motorItem?.ps_to).toBe(620);
    expect(motorItem?.nm_to).toBe(740);

    const { data: outbound, error: outboundError } = await admin
      .from("outbound_emails")
      .select("type")
      .eq("inquiry_id", result.id);
    if (outboundError) throw outboundError;
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
