// Rendert jede Mailvorlage mit einem Fixture-Kontext (de und en, mit und
// ohne Preise, Kurzablauf ohne Modell) und prüft die harten Anforderungen
// aus CLAUDE.md/docs/architektur.md: Sie-Form, Schweizer Preisschreibweise,
// keine Gedankenstriche, Platzhalter vollständig ersetzt, Text-Variante ohne
// HTML-Tags.
import { describe, expect, it } from "vitest";
import { buildConfirmation } from "@/lib/mail/templates/confirmation";
import { buildSummary } from "@/lib/mail/templates/summary";
import { buildInbox } from "@/lib/mail/templates/inbox";
import { buildReply } from "@/lib/mail/templates/reply";
import { buildFollowUp } from "@/lib/mail/templates/follow_up";
import { itemLineText, vehicleLabel } from "@/lib/mail/render";
import type { MailCheck, MailFollowUpContext, MailInquiryContext, MailInquiryItem } from "@/lib/mail/types";
import type { Inquiry, Model, ModelFamily } from "@/lib/supabase/rows";
import type { Locale } from "@/lib/i18n/dictionaries";

// --- Fixtures ----------------------------------------------------------

function baseInquiry(overrides: Partial<Inquiry> = {}): Inquiry {
  return {
    ai_extraction: null,
    answer_received_at: null,
    been_here: true,
    categories: ["motor", "auspuff"],
    channel: "email",
    character: "sportlich",
    checks: [],
    city: "Belp",
    consulting: false,
    created_at: "2026-09-01T09:00:00.000Z",
    draft_reply: null,
    draft_subject: null,
    email: "kunde@example.com",
    estimated_total: 8360,
    family_id: "22222222-2222-2222-2222-222222222222",
    first_name: "Nadia",
    follow_up_answers: { motor: "beides", auspuff: "kraeftig" },
    id: "11111111-1111-1111-1111-111111111111",
    last_name: "Muster",
    locale: "de",
    message: "Bitte auch die Räder anschauen.",
    model_id: "33333333-3333-3333-3333-333333333333",
    number: "2026-0912",
    phone: "+41 79 000 00 00",
    raw_text: null,
    replied_at: null,
    selections: [],
    share_token: "share-token-1234567890ab",
    source: "web",
    status: "neu",
    timing: "m1_2",
    updated_at: "2026-09-01T09:00:00.000Z",
    vehicle_text: null,
    year: "2024",
    ...overrides,
  };
}

function baseFamily(overrides: Partial<ModelFamily> = {}): ModelFamily {
  return {
    active: true,
    brand: "BMW",
    codes: ["G81"],
    created_at: "2026-01-01T00:00:00.000Z",
    has_pricelist: true,
    id: "22222222-2222-2222-2222-222222222222",
    name: "3er G20, G21",
    photo_url: null,
    pricelist_no: "46259",
    short_text: null,
    slug: "bmw-3er-g20-g21",
    sort: 0,
    source_file: "3er.xlsx",
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
    name: "M3 Touring",
    photo_url: null,
    series_nm: 650,
    series_ps: 510,
    series_ps_suggested: [510],
    slug: "m3-touring",
    sort: 0,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const itemsWithPrices: MailInquiryItem[] = [
  { category: "motor", name: "Stufe 1", description: "620 PS / 740 Nm", price_total: 4180, price_status: "priced" },
  { category: "auspuff", name: "Klappenauspuffanlage", description: null, price_total: 4180, price_status: "priced" },
];

const itemsWithoutPrices: MailInquiryItem[] = [
  { category: "motor", name: "Stufe 2", description: "650 PS / 800 Nm", price_total: null, price_status: "in_preparation" },
  { category: "auspuff", name: "Klappenauspuffanlage", description: null, price_total: null, price_status: "on_request" },
];

const checks: MailCheck[] = [
  { id: "motor_auspuff_compat", text: "Kompatibilität Abgasanlage und Motorsoftware prüfen." },
];

const draft = {
  subject: "Ihre Anfrage für den BMW M3 Touring, Nr. 2026-0912",
  body: [
    "Guten Tag Nadia Muster",
    "",
    "Danke für Ihre Anfrage für Ihren M3 Touring (Jahrgang 2024). Sportlich und alltagstauglich, das ist genau unsere Linie.",
    "",
    "Grundsätzlich können wir das so umsetzen:",
    "• Motor: Stufe 1 (620 PS / 740 Nm), ab CHF 4'180",
    "• Auspuff: Klappenauspuffanlage, ab CHF 4'180",
    "",
    "Richtpreis für das Paket: ab CHF 8'360, inklusive Einbau, ohne MFK. Den definitiven Preis bestätige ich Ihnen, sobald wir die Kombination aus Software und Abgasanlage geprüft haben.",
    "",
    "Für die Zeit in ein bis zwei Monaten haben wir Werkstattfenster, wir reservieren Ihnen gerne eines, sobald Sie grünes Licht geben.",
    "",
    "Rufen Sie uns an oder antworten Sie kurz auf diese Mail, dann besprechen wir die Details.",
    "",
    "Sportliche Grüsse aus Belp",
    "Christoph Dähler",
    "dÄHLer Competition Line AG · +41 31 819 88 77",
  ].join("\n"),
};

function makeContext(params: { locale: Locale; items: MailInquiryItem[]; withModel: boolean }): MailInquiryContext {
  const inquiryOverrides: Partial<Inquiry> = { locale: params.locale };
  if (!params.withModel) {
    inquiryOverrides.family_id = null;
    inquiryOverrides.model_id = null;
    inquiryOverrides.vehicle_text = "BMW 3er, Baujahr 2009";
    inquiryOverrides.year = "älter";
  }
  const total = params.items.reduce((sum, i) => sum + (i.price_total ?? 0), 0);
  return {
    inquiry: baseInquiry(inquiryOverrides),
    family: params.withModel ? baseFamily() : null,
    model: params.withModel ? baseModel() : null,
    items: params.items,
    estimatedTotal: total > 0 ? total : null,
    checks,
    draft,
    locale: params.locale,
    appUrl: "https://anfrage.daehler.com",
    shareUrl: "https://anfrage.daehler.com/p/share-token-1234567890ab",
    adminUrl: "https://anfrage.daehler.com/admin/anfragen/11111111-1111-1111-1111-111111111111",
  };
}

function makeFollowUpContext(locale: Locale): MailFollowUpContext {
  return {
    inquiry: {
      id: "11111111-1111-1111-1111-111111111111",
      first_name: "Nadia",
      last_name: "Muster",
      number: "2026-0912",
      email: "kunde@example.com",
    },
    vehicleLabel: "BMW M3 Touring",
    rule: {
      subject: "Ihre Anfrage bei dÄHLer, Nr. {{nummer}}",
      body:
        "Guten Tag {{vorname}} {{name}}\n\n" +
        "Vor einigen Tagen haben wir Ihnen zu Ihrem {{fahrzeug}} ein Angebot zukommen lassen. " +
        "Gerne möchten wir nachfragen, ob sich bei Ihnen inzwischen Fragen ergeben haben oder ob wir " +
        "für Sie einen Termin vereinbaren dürfen.\n\nWir freuen uns auf Ihre Rückmeldung.\n\nFreundliche Grüsse",
    },
    settings: {
      signatureName: "Christoph Dähler",
      companyAddress: "dÄHLer Competition Line AG, Belp",
      signaturePhone: "+41 31 819 88 77",
    },
    locale,
  };
}

// --- Gemeinsame Prüfungen ------------------------------------------------

const DASH_RE = /[–—]/; // Gedankenstriche (en-/em-dash)
// Ganzwort-Treffer auf gängige deutsche Du-Formen (Wortgrenzen, damit z.B.
// "Produkt" oder "wieder" nicht fälschlich anschlagen).
const DU_FORM_RE = /\b(du|dich|dir|dein|deine|deinen|deinem|deiner|deins)\b/i;

function expectWellFormed(result: { subject: string; html: string; text: string }) {
  expect(result.subject.trim().length).toBeGreaterThan(0);
  expect(result.html.length).toBeGreaterThan(0);
  expect(result.text.length).toBeGreaterThan(0);

  // Text-Variante ohne HTML-Tags.
  expect(result.text).not.toMatch(/<[a-zA-Z!/][^>]*>/);

  // Platzhalter vollständig ersetzt: kein "{" (deckt auch "{{...}}" ab) mehr im Ergebnis.
  expect(result.subject).not.toContain("{");
  expect(result.html).not.toContain("{");
  expect(result.text).not.toContain("{");

  // Keine Gedankenstriche.
  expect(result.subject).not.toMatch(DASH_RE);
  expect(result.html).not.toMatch(DASH_RE);
  expect(result.text).not.toMatch(DASH_RE);

  // Keine Du-Formen (Sie-Form gegenüber Endkunden, siehe CLAUDE.md).
  expect(result.subject).not.toMatch(DU_FORM_RE);
  expect(result.text).not.toMatch(DU_FORM_RE);
}

// Preisformat "CHF 4'180": in der Text-Variante unverändert, in HTML wird das
// Apostroph korrekt zu &#39; escaped (siehe lib/mail/render.ts, escapeHtml).
function expectChfFormat(result: { html: string; text: string }) {
  expect(result.text).toContain("CHF 4'180");
  expect(result.html).toContain("CHF 4&#39;180");
}

// --- Tests ---------------------------------------------------------------

describe("Mailvorlagen: gemeinsame Anforderungen", () => {
  const locales: Locale[] = ["de", "en"];
  const priceVariants: { label: string; items: MailInquiryItem[] }[] = [
    { label: "mit Preisen", items: itemsWithPrices },
    { label: "ohne Preise", items: itemsWithoutPrices },
  ];

  for (const locale of locales) {
    for (const variant of priceVariants) {
      const ctx = makeContext({ locale, items: variant.items, withModel: true });

      describe(`locale=${locale}, ${variant.label}, mit Modell`, () => {
        it("confirmation", () => {
          const result = buildConfirmation(ctx);
          expectWellFormed(result);
          for (const item of variant.items) {
            expect(result.html).toContain(item.name);
            expect(result.text).toContain(item.name);
          }
          if (variant.label === "mit Preisen") {
            expectChfFormat(result);
          }
        });

        it("summary", () => {
          const result = buildSummary(ctx);
          expectWellFormed(result);
          for (const item of variant.items) {
            expect(result.html).toContain(item.name);
            expect(result.text).toContain(item.name);
          }
          if (variant.label === "mit Preisen") {
            expectChfFormat(result);
          }
        });

        it("inbox (immer Deutsch)", () => {
          const result = buildInbox(ctx);
          expectWellFormed(result);
          for (const item of variant.items) {
            expect(result.html).toContain(item.name);
            expect(result.text).toContain(item.name);
          }
          expect(result.html).toContain(checks[0].text);
        });

        it("reply", () => {
          const result = buildReply(ctx);
          expectWellFormed(result);
          expect(result.subject).toBe(draft.subject);
          expectChfFormat(result);
        });
      });
    }

    // Kurzablauf ohne Modell (Fahrzeug ohne Preisliste, siehe CLAUDE.md):
    // keine Positionen, kein Richtpreis.
    describe(`locale=${locale}, Kurzablauf ohne Modell`, () => {
      const ctxNoModel = makeContext({ locale, items: [], withModel: false });

      it("confirmation ohne Modell/Positionen", () => {
        const result = buildConfirmation(ctxNoModel);
        expectWellFormed(result);
        expect(result.subject).toContain("BMW 3er");
      });

      it("summary ohne Modell/Positionen", () => {
        const result = buildSummary(ctxNoModel);
        expectWellFormed(result);
      });

      it("inbox ohne Modell/Positionen", () => {
        const result = buildInbox(ctxNoModel);
        expectWellFormed(result);
      });
    });
  }

  for (const locale of locales) {
    it(`follow_up (locale=${locale}): Platzhalter ersetzt, Signatur aus settings`, () => {
      const result = buildFollowUp(makeFollowUpContext(locale));
      expectWellFormed(result);
      expect(result.subject).toContain("2026-0912");
      expect(result.text).toContain("Nadia");
      expect(result.text).toContain("BMW M3 Touring");
      expect(result.text).toContain("Christoph Dähler");
    });
  }
});

// --- Regression Befund #1 (Mail-Prüfung): vehicleLabel() mit echten
// Namenspaaren aus der Excel-Preisliste, siehe docs/excel-import.md. Vorher
// klebte vehicleLabel() brand + family.name + model.name zusammen, was bei
// diesen realen Kombinationen zu Dubletten führte ("BMW M2 G87 M2", "MINI
// MINI F60 Countryman Countryman One (Benzin)").
describe("vehicleLabel: reale Namenspaare aus der Preisliste (Befund #1)", () => {
  it('BMW M2 G87, Modell "M2": Baureihen-Code nicht doppelt', () => {
    const family = baseFamily({ brand: "BMW", name: "M2 G87", codes: ["G87"], slug: "bmw-m2-g87" });
    const model = baseModel({ name: "M2", family_id: family.id });
    expect(vehicleLabel({ family, model, vehicleText: null })).toBe("BMW M2 G87");
  });

  it('MINI F60 Countryman, Modell "Countryman One (Benzin)": Marke nicht doppelt', () => {
    const family = baseFamily({
      brand: "MINI",
      name: "MINI F60 Countryman",
      codes: ["F60"],
      slug: "mini-f60-countryman",
    });
    const model = baseModel({ name: "Countryman One (Benzin)", family_id: family.id });
    expect(vehicleLabel({ family, model, vehicleText: null })).toBe("MINI Countryman One (Benzin) F60");
  });

  it('BMW M3 / M4 G80, G81, G82, G83, Modell "M3 Competition": mehrdeutiger Code (4 Codes, keine Modell-Code-Zuordnung in der DB) wird weggelassen statt geraten, kein "M3" doppelt', () => {
    const family = baseFamily({
      brand: "BMW",
      name: "M3 / M4 G80, G81, G82, G83",
      codes: ["G80", "G81", "G82", "G83"],
      slug: "bmw-m3-m4",
    });
    const model = baseModel({ name: "M3 Competition", family_id: family.id });
    const label = vehicleLabel({ family, model, vehicleText: null });
    expect(label).toBe("BMW M3 Competition");
    expect(label.match(/M3/g)?.length).toBe(1);
  });

  it('BMW 1er M E82, Modell "1er M": kein doppeltes "1er M"', () => {
    const family = baseFamily({ brand: "BMW", name: "1er M E82", codes: ["E82"], slug: "bmw-1er-m-e82" });
    const model = baseModel({ name: "1er M", family_id: family.id });
    expect(vehicleLabel({ family, model, vehicleText: null })).toBe("BMW 1er M E82");
  });

  it("Betreff der Bestätigungsmail entspricht dem Sollbeispiel aus docs/architektur.md", () => {
    const family = baseFamily({ brand: "BMW", name: "M2 G87", codes: ["G87"], slug: "bmw-m2-g87" });
    const model = baseModel({ name: "M2", family_id: family.id });
    const ctx: MailInquiryContext = {
      inquiry: baseInquiry({ number: "2026-0012", family_id: family.id, model_id: model.id }),
      family,
      model,
      items: [],
      estimatedTotal: null,
      checks: [],
      draft,
      locale: "de",
      appUrl: "https://anfrage.daehler.com",
      shareUrl: "https://anfrage.daehler.com/p/share-token-1234567890ab",
      adminUrl: "https://anfrage.daehler.com/admin/anfragen/11111111-1111-1111-1111-111111111111",
    };
    const result = buildConfirmation(ctx);
    expect(result.subject).toBe("Ihre Anfrage für den BMW M2 G87, Nr. 2026-0012");
  });
});

// --- Regression Befund #1 (Anfrage-Prüfung): inquiries.vehicle_text ohne
// Modell. Vorher gab vehicleLabel() bei gesetzter family (familyId ist in
// lib/inquiry/schema.ts immer Pflicht) den vehicleText NIE zurück - im
// Kurzablauf (Platzhalterfamilien "Älteres Modell" / "Älteres MINI-Modell" /
// "Anderes Toyota-Modell", siehe supabase/seed.sql) erschien so statt des
// vom Kunden genannten Fahrzeugs der Platzhaltername im Kundentext
// ("Ihren BMW Älteres Modell").
describe("vehicleLabel: inquiries.vehicle_text ohne Modell (Befund #1 der Anfrage-Prüfung)", () => {
  it("Platzhalterfamilie (has_pricelist=false) + vehicleText: Kundentext geht vor dem Platzhalternamen", () => {
    const family = baseFamily({
      brand: "BMW",
      name: "Älteres Modell",
      codes: [],
      slug: "bmw-aelteres-modell",
      has_pricelist: false,
    });
    expect(vehicleLabel({ family, model: null, vehicleText: "320i Touring, Baujahr 2011" })).toBe(
      "320i Touring, Baujahr 2011",
    );
  });

  it('Platzhalterfamilie ohne vehicleText: nur die Marke ("BMW"), nicht der Platzhaltername - fügt sich in "Ihren {model}" ein', () => {
    const family = baseFamily({
      brand: "BMW",
      name: "Älteres Modell",
      codes: [],
      slug: "bmw-aelteres-modell",
      has_pricelist: false,
    });
    expect(vehicleLabel({ family, model: null, vehicleText: null })).toBe("BMW");
  });

  it('MINI- und Toyota-Platzhalter ("Älteres MINI-Modell", "Anderes Toyota-Modell") ohne vehicleText: ebenfalls nur die Marke', () => {
    const mini = baseFamily({
      brand: "MINI",
      name: "Älteres MINI-Modell",
      codes: [],
      slug: "mini-aelteres-modell",
      has_pricelist: false,
    });
    const toyota = baseFamily({
      brand: "Toyota",
      name: "Anderes Toyota-Modell",
      codes: [],
      slug: "toyota-anderes-modell",
      has_pricelist: false,
    });
    expect(vehicleLabel({ family: mini, model: null, vehicleText: null })).toBe("MINI");
    expect(vehicleLabel({ family: toyota, model: null, vehicleText: null })).toBe("Toyota");
  });

  it("Echte Familie ohne Preisliste (Wiesmann) ohne vehicleText: behält ihren echten Namen statt der Marke (kein Platzhalter)", () => {
    const family = baseFamily({
      brand: "Wiesmann",
      name: "GT MF5",
      codes: [],
      slug: "wiesmann-gt-mf5",
      has_pricelist: false,
    });
    expect(vehicleLabel({ family, model: null, vehicleText: null })).toBe("Wiesmann GT MF5");
  });

  it("Modell vorhanden: vehicleText bleibt unberücksichtigt (Modell/Code-Logik hat Vorrang, unverändert zu Befund #1 der Mail-Prüfung)", () => {
    const family = baseFamily({ brand: "BMW", name: "M2 G87", codes: ["G87"], slug: "bmw-m2-g87" });
    const model = baseModel({ name: "M2", family_id: family.id });
    expect(vehicleLabel({ family, model, vehicleText: "Mein Auto" })).toBe("BMW M2 G87");
  });
});

// --- Regression Befund #2 (Anfrage-Prüfung): itemLineText() mit
// mehrzeiliger Beschreibung. products.description enthält bei allen
// Radsätzen echte Zeilenumbrüche aus der Excel-Zelle (Vorder-/Hinterachse
// getrennt, siehe docs/excel-import.md); roh eingesetzt landete der
// Zeilenumbruch mitten in der Klammer der Positionszeile.
describe("itemLineText: mehrzeilige Beschreibung und Doppelpunkt am Namensende (Befund #2 der Anfrage-Prüfung)", () => {
  it("Radsatz-Beschreibung mit Zeilenumbruch (Vorder-/Hinterachse): zu einer Zeile zusammengefasst, kein Doppelpunkt vor der Klammer", () => {
    const item: MailInquiryItem = {
      category: "raeder",
      name: "CDC1 FORGED Radsatz geschmiedet bestehend aus:",
      description: '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20',
      price_total: 7100,
      price_status: "priced",
    };
    const line = itemLineText(item, "de");
    expect(line).toBe(
      '• Räder: CDC1 FORGED Radsatz geschmiedet bestehend aus (10 x 20" mit 275/30 20, 10 x 20" mit 285/30 20), ab CHF 7\'100',
    );
    expect(line).not.toMatch(/\n/);
    expect(line).not.toContain("aus:");
  });

  it("Name ohne abschliessenden Doppelpunkt bleibt unverändert (z.B. Motor-Leistungsstufen mit Doppelpunkt mitten im Namen)", () => {
    const item: MailInquiryItem = {
      category: "motor",
      name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm",
      description: null,
      price_total: 4180,
      price_status: "priced",
    };
    expect(itemLineText(item, "de")).toBe("• Motor: Stufe 1: (Basis 480 PS) 620PS / 740Nm, ab CHF 4'180");
  });
});
