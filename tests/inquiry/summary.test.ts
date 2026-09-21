// Rückmeldungen aus dem ersten Klicktest (Kundenflow M2 G87), siehe
// CLAUDE.md Abschnitt "AUFGABE", Punkte 1 und 3: lib/inquiry/summary.ts
// buildSummaryText() zeigt "Getriebe: Handschalter" und die gefaltete
// Positionsdarstellung ("Stufe 1 (590 PS / 720 Nm, ...)" statt des vollen
// Excel-Rohnamens), analog den Mailvorlagen (siehe tests/mail/templates.test.ts).
import { describe, expect, it } from "vitest";
import { buildSummaryText, goalText } from "@/lib/inquiry/summary";
import type { MailInquiryContext, MailInquiryItem } from "@/lib/mail/types";
import type { Inquiry, Model, ModelFamily } from "@/lib/db/rows";

function baseInquiry(overrides: Partial<Inquiry> = {}): Inquiry {
  return {
    ai_extraction: null,
    answer_received_at: null,
    been_here: true,
    categories: ["motor"],
    channel: "email",
    character: "sportlich",
    checks: [],
    city: "Belp",
    consulting: false,
    created_at: "2026-09-01T09:00:00.000Z",
    draft_reply: null,
    draft_subject: null,
    email: "kunde@example.com",
    estimated_total: 4180,
    family_id: "22222222-2222-2222-2222-222222222222",
    first_name: "Nadia",
    follow_up_answers: {},
    gearbox: "manual",
    body_style: null,
    drive: null,
    translations: null,
    line: null,
    id: "11111111-1111-1111-1111-111111111111",
    last_name: "Muster",
    locale: "de",
    message: "",
    model_id: "33333333-3333-3333-3333-333333333333",
    number: "2026-0912",
    phone: "+41 79 000 00 00",
    raw_text: null,
    replied_at: null,
    selections: [],
    series_ps: null,
    share_token: "share-token-1234567890ab",
    source: "web",
    status: "neu",
    timing: "m1_2",
    updated_at: "2026-09-01T09:00:00.000Z",
    vehicle_text: null,
    year: "2025",
    ...overrides,
  };
}

function baseFamily(overrides: Partial<ModelFamily> = {}): ModelFamily {
  return {
    active: true,
    brand: "BMW",
    codes: ["G87"],
    created_at: "2026-01-01T00:00:00.000Z",
    has_pricelist: true,
    id: "22222222-2222-2222-2222-222222222222",
    name: "M2 G87",
    photo_url: null,
    pricelist_no: "1",
    short_text: null,
    slug: "m2-g87",
    sort: 0,
    source_file: "M2.xlsx",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseModel(overrides: Partial<Model> = {}): Model {
  return {
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    family_id: "22222222-2222-2222-2222-222222222222",
    fuel: "benzin",
    id: "33333333-3333-3333-3333-333333333333",
    name: "M2",
    photo_url: null,
    series_nm: null,
    series_ps: null,
    series_ps_suggested: [480],
    slug: "m2",
    sort: 0,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const STUFE_1: MailInquiryItem = {
  category: "motor",
  name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe)",
  description: null,
  price_total: 4180,
  price_status: "priced",
  ps_to: 620,
  nm_to: 740,
};

function ctx(overrides: Partial<MailInquiryContext> = {}): MailInquiryContext {
  const family = baseFamily();
  const model = baseModel();
  return {
    inquiry: baseInquiry(),
    family,
    model,
    items: [STUFE_1],
    estimatedTotal: 4180,
    checks: [],
    draft: { subject: "Betreff", body: "Text" },
    locale: "de",
    appUrl: "https://anfrage.daehler.com",
    shareUrl: "https://anfrage.daehler.com/p/share-token-1234567890ab",
    adminUrl: "https://anfrage.daehler.com/admin/anfragen/11111111-1111-1111-1111-111111111111",
    ...overrides,
  };
}

describe("buildSummaryText: Getriebe-Zeile (Rückmeldung erster Klicktest)", () => {
  it("zeigt 'Getriebe: Handschalter' in der FAHRZEUG-Zeile", () => {
    const text = buildSummaryText(ctx());
    const vehicleLine = text.split("\n").find((l) => l.trim().startsWith("FAHRZEUG"));
    expect(vehicleLine).toContain("Getriebe: Handschalter");
  });

  it("Automat und unknown werden ebenfalls gezeigt", () => {
    const automatic = buildSummaryText(ctx({ inquiry: baseInquiry({ gearbox: "automatic" }) }));
    expect(automatic).toContain("Getriebe: Automat");
    const unknown = buildSummaryText(ctx({ inquiry: baseInquiry({ gearbox: "unknown" }) }));
    expect(unknown).toContain("Getriebe: unbekannt");
  });

  it("ohne Getriebeangabe (gearbox null) keine Getriebe-Notiz in der FAHRZEUG-Zeile", () => {
    // Nicht "not.toContain('Getriebe')" für den ganzen Text: die
    // Positionszeile selbst enthält "M6 & A8-Getriebe" (Teil des
    // Produktnamens), das bleibt unabhängig von der Getriebe-Antwort stehen.
    const text = buildSummaryText(ctx({ inquiry: baseInquiry({ gearbox: null }) }));
    const vehicleLine = text.split("\n").find((l) => l.trim().startsWith("FAHRZEUG"));
    expect(vehicleLine).not.toContain("Getriebe");
  });
});

// docs/architektur.md, Abschnitt "Fahrzeugbezeichnung", Regel 5: intern
// zusätzlich "Baureihe: ... · Motorisierung: ..." (roh, ohne die
// Aufbereitung der kundensichtbaren Bezeichnung), damit dÄHLer die
// Excel-Preisliste sofort zuordnen kann.
describe("buildSummaryText: 'Baureihe: ... · Motorisierung: ...' in der FAHRZEUG-Zeile", () => {
  it("mit Familie und Modell", () => {
    const text = buildSummaryText(ctx());
    const vehicleLine = text.split("\n").find((l) => l.trim().startsWith("FAHRZEUG"));
    expect(vehicleLine).toContain("Baureihe: M2 G87 · Motorisierung: M2");
  });

  it("Kurzablauf ohne Familie: keine Baureihen-Zeile (nichts, worüber dÄHLer die Preisliste zuordnen könnte)", () => {
    const text = buildSummaryText(ctx({ family: null, model: null, inquiry: baseInquiry({ family_id: null, model_id: null, vehicle_text: "320i Touring" }) }));
    const vehicleLine = text.split("\n").find((l) => l.trim().startsWith("FAHRZEUG"));
    expect(vehicleLine).not.toContain("Baureihe");
  });
});

describe("buildSummaryText: Positionsdarstellung wie im Antwortentwurf", () => {
  it("zeigt den gefalteten Namen, nicht den vollen Excel-Rohnamen", () => {
    const text = buildSummaryText(ctx());
    expect(text).toContain("Motor: Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe)");
    expect(text).not.toContain("(Basis 480 PS)");
  });
});

describe("goalText: bleibt unverändert (Regression)", () => {
  it("liefert einen leeren String ohne Folgefragen-Antworten und ohne Leistungsangabe", () => {
    const text = goalText(ctx({ items: [{ ...STUFE_1, ps_to: null, nm_to: null, description: null }] }));
    expect(text).toBe("");
  });
});
