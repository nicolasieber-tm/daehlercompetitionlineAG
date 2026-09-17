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
import { buildBeforeAfterRows } from "@/lib/catalog/before-after";
import type { MailCheck, MailFollowUpContext, MailInquiryContext, MailInquiryItem } from "@/lib/mail/types";
import type { Inquiry, Model, ModelFamily } from "@/lib/db/rows";
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
    gearbox: null,
    line: null,
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
    series_ps: null,
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
    "Danke für Ihre Anfrage für Ihren M3 Touring, Jahrgang 2024. Sportlich und alltagstauglich, das ist genau unsere Linie.",
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
    // companyName (settings.mail_from_name) + companyAddress (settings.
    // company_address, hier "Belp") ergeben zusammen dieselbe Firmenzeile
    // wie vorher ("dÄHLer Competition Line AG, Belp") - Prüfung Phase B,
    // Punkt 6, siehe lib/mail/templates/follow_up.ts.
    settings: {
      signatureName: "Christoph Dähler",
      companyName: "dÄHLer Competition Line AG",
      companyAddress: "Belp",
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

  // Platzhalter vollständig ersetzt: kein "{wort}" (deckt auch "{{wort}}" ab)
  // mehr im Ergebnis. Nicht mehr ein blosses "kein { im Ergebnis" - das
  // Inline-CSS in den style-Attributen der Bausteine (z.B.
  // beforeAfterTable(), lib/mail/render.ts) enthält "{"/"}" nirgends,
  // trotzdem bleibt der engere Regex bestehen, falls ein künftiger
  // Baustein doch wieder geschweifte Klammern braucht.
  const PLACEHOLDER_RE = /\{[a-zA-Z_]+\}/;
  expect(result.subject).not.toMatch(PLACEHOLDER_RE);
  expect(result.html).not.toMatch(PLACEHOLDER_RE);
  expect(result.text).not.toMatch(PLACEHOLDER_RE);

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

  // Befund «polish» #1: der ausgelieferte Seed-Wert für company_address
  // (db/seed.sql) ist bereits "dÄHLer Competition Line AG, Belp"
  // (voller Firmenname inklusive), nicht die reine Adresse "Belp" wie in
  // makeFollowUpContext() oben. Mit diesen Werten hängte follow_up.ts den
  // Firmennamen bisher ein zweites Mal davor ("dÄHLer Competition Line AG,
  // dÄHLer Competition Line AG, Belp · +41 31 819 88 77").
  it("follow_up: Signatur mit den ausgelieferten Seed-Werten (settings.company_address enthält den Firmennamen bereits), keine doppelte Firmenzeile", () => {
    const ctx: MailFollowUpContext = {
      ...makeFollowUpContext("de"),
      settings: {
        signatureName: "Christoph Dähler",
        companyName: "dÄHLer Competition Line AG",
        companyAddress: "dÄHLer Competition Line AG, Belp",
        signaturePhone: "+41 31 819 88 77",
      },
    };
    const result = buildFollowUp(ctx);
    expect(result.text).toContain("dÄHLer Competition Line AG, Belp · +41 31 819 88 77");
    expect(result.text).not.toContain("dÄHLer Competition Line AG, dÄHLer Competition Line AG");
  });
});

// --- Korrektur 15.09.2026 (Prüfung Modul Produkte, Befund 2): eine
// Leistungsstufe ohne ps_to (13 aktive, echte Produkte im Bestand, z.B. 5er
// G60/G61 "(Basis 208 PS)  PS / Nm B48", noch unbepreiste Platzhalter) wurde
// in confirmation/summary/inbox bisher über die veraltete `ps_to !=
// null`-Herleitung NICHT als Stufe erkannt (isStage=false) und zeigte den
// rohen, mehrdeutigen Excel-Namen inkl. "(Basis ...)"-Rest, während Kachel
// und Antwortentwurf (die bereits variant_group nutzten) "Leistungssteigerung
// (B48)" zeigten - drei inkonsistente Kundentexte derselben Anfrage. Nach
// der Korrektur (isStageItem() in lib/catalog/product-display.ts, über
// variant_group statt ps_to) zeigen alle drei denselben, bereinigten Titel.
describe("Mailvorlagen: Leistungsstufe ohne ps_to (Prüfung Modul Produkte, Befund 2)", () => {
  const stageWithoutPsTo: MailInquiryItem = {
    category: "motor",
    name: "(Basis 208 PS)  PS / Nm B48",
    description: null,
    price_total: null,
    price_status: "on_request",
    ps_to: null,
    nm_to: null,
    variant_group: "leistung",
  };
  const ctx = makeContext({ locale: "de", items: [stageWithoutPsTo], withModel: true });

  it("confirmation: 'Leistungssteigerung (B48)' statt des rohen '(Basis 208 PS)  PS / Nm B48'-Excel-Namens", () => {
    const result = buildConfirmation(ctx);
    expect(result.text).toContain("Leistungssteigerung (B48)");
    expect(result.text).not.toContain("(Basis 208 PS)");
  });

  it("summary: dieselbe Herleitung wie confirmation", () => {
    const result = buildSummary(ctx);
    expect(result.text).toContain("Leistungssteigerung (B48)");
    expect(result.text).not.toContain("(Basis 208 PS)");
  });

  it("inbox: 'Leistungssteigerung (B48)' PLUS Original-Excel-Name als 'Excel: ...'-Notiz", () => {
    const result = buildInbox(ctx);
    expect(result.text).toContain("Leistungssteigerung (B48)");
    expect(result.text).toContain("Excel: (Basis 208 PS)  PS / Nm B48");
  });

  it("Altdaten ohne variant_group (undefined): Fallback bleibt ps_to != null, wie vor der Korrektur", () => {
    const legacyItem: MailInquiryItem = { ...stageWithoutPsTo, variant_group: undefined };
    const ctxLegacy = makeContext({ locale: "de", items: [legacyItem], withModel: true });
    const result = buildConfirmation(ctxLegacy);
    // ps_to ist hier ebenfalls null -> Fallback erkennt keine Stufe, roher Name bleibt (unverändertes Altverhalten).
    expect(result.text).toContain("(Basis 208 PS)");
  });
});

// --- Fahrzeugbezeichnung (docs/architektur.md, Abschnitt
// "Fahrzeugbezeichnung", Stand 15.09.2026): vehicleLabel() mit echten
// Namenspaaren aus der Excel-Preisliste, siehe docs/excel-import.md.
// Kundenrückmeldung "BMW M2 G87, M2 liest sich doppelt": die Codes stehen
// jetzt in Klammern am Ende statt als Teil der Familienzeile, Linie und
// Modellname werden zu einem Satz verschmolzen statt komma-getrennt
// aneinandergehängt (siehe lib/mail/render.ts vehicleLabel(), lib/catalog/
// vehicle-label.ts).
describe("vehicleLabel: reale Namenspaare aus der Preisliste (Fahrzeugbezeichnung, docs/architektur.md)", () => {
  it('BMW M2 G87, Modell "M2": kein doppeltes Lesen mehr, Code in Klammern', () => {
    const family = baseFamily({ brand: "BMW", name: "M2 G87", codes: ["G87"], slug: "bmw-m2-g87" });
    const model = baseModel({ name: "M2", family_id: family.id });
    expect(vehicleLabel({ family, model, vehicleText: null })).toBe("BMW M2 (G87)");
  });

  it('MINI F60 Countryman, Modell "Countryman One (Benzin)": Marke nicht doppelt, Linie und Modellname verschmolzen, keine Doppelklammer (Feinschliff-Prüfung 15.09.2026)', () => {
    const family = baseFamily({
      brand: "MINI",
      name: "MINI F60 Countryman",
      codes: ["F60"],
      slug: "mini-f60-countryman",
    });
    const model = baseModel({ name: "Countryman One (Benzin)", family_id: family.id });
    // Die Motorisierung trägt selbst schon eine Klammer (Kraftstoffart aus
    // dem Excel-Namen) - Codes werden mit ihrem Inhalt zu EINER Klammer
    // verschmolzen statt eine zweite anzuhängen ("... (Benzin) (F60)").
    expect(vehicleLabel({ family, model, vehicleText: null })).toBe(
      "MINI Countryman One (Benzin, F60)",
    );
  });

  it('BMW M3 / M4 G80, G81, G82, G83, Modell "M3 Competition": Alternative "M3" teilt mehr Wörter mit der Motorisierung als "M4"', () => {
    const family = baseFamily({
      brand: "BMW",
      name: "M3 / M4 G80, G81, G82, G83",
      codes: ["G80", "G81", "G82", "G83"],
      slug: "bmw-m3-m4",
    });
    const model = baseModel({ name: "M3 Competition", family_id: family.id });
    expect(vehicleLabel({ family, model, vehicleText: null })).toBe(
      "BMW M3 Competition (G80, G81, G82, G83)",
    );
  });

  it('BMW 1er M E82, Modell "1er M": Codes in Klammern, "1er M" nicht verdoppelt (schon Teil der Linie)', () => {
    const family = baseFamily({ brand: "BMW", name: "1er M E82", codes: ["E82"], slug: "bmw-1er-m-e82" });
    const model = baseModel({ name: "1er M", family_id: family.id });
    expect(vehicleLabel({ family, model, vehicleText: null })).toBe("BMW 1er M (E82)");
  });

  it("Betreff der Bestätigungsmail: Familie + Modell, kein doppeltes Lesen (Kundenrückmeldung)", () => {
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
    // docs/architektur.md, Abschnitt "Fahrzeugbezeichnung": "Ihre Anfrage
    // für den BMW M2 (G87), Nr. 2026-0012".
    expect(result.subject).toBe("Ihre Anfrage für den BMW M2 (G87), Nr. 2026-0012");
  });
});

// --- docs/architektur.md, Abschnitt "Fahrzeugbezeichnung", Regel 4: "kein
// Weglassen des Familiennamens" gilt weiterhin OHNE vehicleText (die
// Platzhalterfamilie bleibt dann der einzige Anhaltspunkt) - MIT
// vehicleText ersetzt vehicleText die Familienzeile jetzt vollständig
// (Marke + vehicleText, nicht mehr "Marke + Linie + vehicleText"):
// Kundenrückmeldung "BMW M2 G87, M2 liest sich doppelt" gilt genauso für
// "BMW Älteres Modell, 320i Touring" - der nichtssagende Platzhaltername
// bringt dort nichts Zusätzliches, der Freitext allein ist aussagekräftiger.
describe("vehicleLabel: vehicle_text und Platzhalterfamilien (Fahrzeugbezeichnung, docs/architektur.md)", () => {
  it("Platzhalterfamilie (has_pricelist=false) MIT vehicleText: Marke + vehicleText, der Platzhaltername bleibt weg", () => {
    const family = baseFamily({
      brand: "BMW",
      name: "Älteres Modell",
      codes: [],
      slug: "bmw-aelteres-modell",
      has_pricelist: false,
    });
    expect(vehicleLabel({ family, model: null, vehicleText: "320i Touring, Baujahr 2011" })).toBe(
      "BMW 320i Touring, Baujahr 2011",
    );
  });

  it("Platzhalterfamilie ohne vehicleText: Marke + Platzhaltername (nicht nur die Marke)", () => {
    const family = baseFamily({
      brand: "BMW",
      name: "Älteres Modell",
      codes: [],
      slug: "bmw-aelteres-modell",
      has_pricelist: false,
    });
    expect(vehicleLabel({ family, model: null, vehicleText: null })).toBe("BMW Älteres Modell");
  });

  it('MINI- und Toyota-Platzhalter, von Hand mit Markenwort in der Mitte gepflegt ("Älteres MINI-Modell", "Anderes Toyota-Modell"): die Marke wird trotzdem nicht verdoppelt (Feinschliff-Prüfung 15.09.2026)', () => {
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
    // "Älteres MINI-Modell" beginnt nicht mit "MINI" (Marke steht in der
    // Mitte des Namens) - vehicleFamilyLine() entfernt das Markenwort jetzt
    // an JEDER Position der Linie, nicht nur am Anfang (siehe
    // lib/catalog/vehicle-label.ts stripBrandWord()), sonst "MINI Älteres
    // MINI-Modell". Die ausgelieferten Seed-Namen heissen deshalb seit
    // diesem Feinschliff einheitlich "Älteres Modell"/"Anderes Modell" ohne
    // Markenwort (db/seed.sql) - dieser Test bildet weiterhin einen
    // von Hand nachgetragenen Namen MIT Markenwort ab, als Schutznetz.
    expect(vehicleLabel({ family: mini, model: null, vehicleText: null })).toBe("MINI Älteres Modell");
    expect(vehicleLabel({ family: toyota, model: null, vehicleText: null })).toBe("Toyota Anderes Modell");
  });

  it("Echte Familie ohne Preisliste (Wiesmann) ohne vehicleText: behält ihren echten Namen (unverändert)", () => {
    const family = baseFamily({
      brand: "Wiesmann",
      name: "GT MF5",
      codes: [],
      slug: "wiesmann-gt-mf5",
      has_pricelist: false,
    });
    expect(vehicleLabel({ family, model: null, vehicleText: null })).toBe("Wiesmann GT MF5");
  });

  it("Modell vorhanden: vehicleText bleibt unberücksichtigt, Familienname UND Modellname erscheinen", () => {
    const family = baseFamily({ brand: "BMW", name: "M2 G87", codes: ["G87"], slug: "bmw-m2-g87" });
    const model = baseModel({ name: "M2", family_id: family.id });
    expect(vehicleLabel({ family, model, vehicleText: "Mein Auto" })).toBe("BMW M2 (G87)");
  });

  it("keine Familie bekannt: vehicle_text bleibt der einzige Fallback", () => {
    expect(vehicleLabel({ family: null, model: null, vehicleText: "Mein Auto" })).toBe("Mein Auto");
    expect(vehicleLabel({ family: null, model: null, vehicleText: null })).toBe("");
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

// --- Prüfung Phase B, Punkt 2 (major): inbox.ts ZIEL-Zeile aus ps_to/nm_to
// des gewählten Motor-Leistungsprodukts, nicht aus description, und über
// lib/inquiry/summary.ts goalText() für die Folgefragen-Antworten (kein
// eigenes Duplikat mehr). ps_to/nm_to sind auf MailInquiryItem optional
// (siehe dortiger Kommentar): dieser Test setzt sie explizit, um den
// gesamten (korrekten) Pfad zu prüfen.
describe("buildInbox: ZIEL-Zeile aus ps_to/nm_to (Prüfung Phase B, Punkt 2)", () => {
  it("zeigt die Leistungsangabe aus ps_to/nm_to, nicht aus description, plus die Folgefrage-Antworten", () => {
    const family = baseFamily();
    const model = baseModel({ family_id: family.id });
    const motorItem: MailInquiryItem = {
      category: "motor",
      name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm",
      // Realistische Randbemerkung wie bei den 8 echten Stufen mit
      // description (siehe lib/catalog/product-display.ts stageDisplay()-
      // Kommentar, Prüfung Modul Parser Befund 2) - die ZIEL-Zeile (aus
      // ps_to/nm_to) darf sie trotzdem nicht verwenden, die Positionszeile
      // (GESCHÄTZTES PAKET) dagegen schon (siehe unten).
      description: "nicht die Leistungsangabe",
      price_total: 4180,
      price_status: "priced",
      ps_to: 620,
      nm_to: 740,
    };
    const ctx: MailInquiryContext = {
      inquiry: baseInquiry({
        family_id: family.id,
        model_id: model.id,
        categories: ["motor", "auspuff"],
        follow_up_answers: { motor: "beides", auspuff: "kraeftig" },
      }),
      family,
      model,
      items: [motorItem],
      estimatedTotal: 4180,
      checks: [],
      draft,
      locale: "de",
      appUrl: "https://anfrage.daehler.com",
      shareUrl: "https://anfrage.daehler.com/p/share-token-1234567890ab",
      adminUrl: "https://anfrage.daehler.com/admin/anfragen/11111111-1111-1111-1111-111111111111",
    };

    const result = buildInbox(ctx);
    const zielLine = result.text.split("\n").find((l) => l.startsWith("ZIEL:"));
    expect(zielLine).toBe("ZIEL: ca. 620 PS / 740 Nm, Beides, Auspuff: Kräftig");
    // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
    // die Positionszeile (GESCHÄTZTES PAKET) zeigt seit
    // lib/mail/templates/inbox.ts inboxItems() den kurzen, unterscheidbaren
    // Titel statt des vollen Excel-Namens, PLUS den Original-Excel-Namen als
    // Notiz ("dÄHLer kennt seine Bezeichnungen"). Korrektur 15.09.2026
    // (Prüfung Modul Parser, Befund 2): die description wird für
    // Leistungsstufen NICHT mehr verworfen - 8 aktive Stufen tragen die
    // V/max-Angabe ausschliesslich dort, ohne sie fehlte der Unterschied
    // zwischen sonst identisch benannten Stufen. Sie erscheint deshalb hier
    // als zusätzliche Detailangabe in der Klammer.
    expect(result.text).toContain(
      "• Motor: Stufe 1 (620 PS / 740 Nm, nicht die Leistungsangabe) (Excel: Stufe 1: (Basis 480 PS) 620PS / 740Nm)",
    );
  });

  it("ohne ps_to (Feld nicht gesetzt): keine Leistungsangabe, Folgefrage-Antworten bleiben trotzdem sichtbar", () => {
    const family = baseFamily();
    const model = baseModel({ family_id: family.id });
    const motorItem: MailInquiryItem = {
      category: "motor",
      name: "Stufe 1",
      description: "irrelevanter Text",
      price_total: 4180,
      price_status: "priced",
    };
    const ctx: MailInquiryContext = {
      inquiry: baseInquiry({
        family_id: family.id,
        model_id: model.id,
        categories: ["auspuff"],
        follow_up_answers: { auspuff: "kraeftig" },
      }),
      family,
      model,
      items: [motorItem],
      estimatedTotal: 4180,
      checks: [],
      draft,
      locale: "de",
      appUrl: "https://anfrage.daehler.com",
      shareUrl: "https://anfrage.daehler.com/p/share-token-1234567890ab",
      adminUrl: "https://anfrage.daehler.com/admin/anfragen/11111111-1111-1111-1111-111111111111",
    };

    const result = buildInbox(ctx);
    const zielLine = result.text.split("\n").find((l) => l.startsWith("ZIEL:"));
    // Ohne ps_to keine Leistungsangabe (nicht "ca. undefined PS" o.ä.), aber
    // die Folgefrage-Antwort für Auspuff bleibt sichtbar.
    expect(zielLine).toBe("ZIEL: Auspuff: Kräftig");
    expect(zielLine).not.toContain("irrelevanter Text");
    expect(zielLine).not.toContain("PS");
  });
});

// Rückmeldungen aus dem ersten Klicktest (Kundenflow M2 G87), siehe
// CLAUDE.md Abschnitt "AUFGABE", Punkte 1 und 3.
describe("Klicktest-Rückmeldung: Getriebe-Zeile und Positionsdarstellung", () => {
  const stufe1: MailInquiryItem = {
    category: "motor",
    name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe)",
    description: null,
    price_total: 4180,
    price_status: "priced",
    ps_to: 620,
    nm_to: 740,
  };

  function m2Ctx(overrides: Partial<MailInquiryContext> = {}): MailInquiryContext {
    const family = baseFamily();
    const model = baseModel({ family_id: family.id });
    return {
      inquiry: baseInquiry({ family_id: family.id, model_id: model.id, gearbox: "manual" }),
      family,
      model,
      items: [stufe1],
      estimatedTotal: 4180,
      checks: [],
      draft,
      locale: "de",
      appUrl: "https://anfrage.daehler.com",
      shareUrl: "https://anfrage.daehler.com/p/share-token-1234567890ab",
      adminUrl: "https://anfrage.daehler.com/admin/anfragen/11111111-1111-1111-1111-111111111111",
      ...overrides,
    };
  }

  it("buildInbox zeigt 'Getriebe: Handschalter' in der FAHRZEUG-Zeile", () => {
    const result = buildInbox(m2Ctx());
    const vehicleLine = result.text.split("\n").find((l) => l.startsWith("FAHRZEUG:"));
    expect(vehicleLine).toContain("Getriebe: Handschalter");
  });

  it("ohne Getriebeangabe (gearbox null) keine Getriebe-Zeile", () => {
    const result = buildInbox(m2Ctx({ inquiry: { ...m2Ctx().inquiry, gearbox: null } }));
    const vehicleLine = result.text.split("\n").find((l) => l.startsWith("FAHRZEUG:"));
    expect(vehicleLine).not.toContain("Getriebe");
  });

  // docs/architektur.md, Abschnitt "Fahrzeugbezeichnung", Regel 5: intern
  // zusätzlich "Baureihe: ... · Motorisierung: ..." (roh), damit dÄHLer die
  // Excel-Preisliste sofort zuordnen kann.
  it("buildInbox zeigt 'Baureihe: ... · Motorisierung: ...' (roh, aus family.name/model.name) in der FAHRZEUG-Zeile", () => {
    const result = buildInbox(m2Ctx());
    const vehicleLine = result.text.split("\n").find((l) => l.startsWith("FAHRZEUG:"));
    // m2Ctx() (siehe oben) nutzt baseFamily()/baseModel(): name "3er G20,
    // G21" / "M3 Touring" - vehicleInternalLine() zeigt beide Rohnamen
    // unverändert, unabhängig von der aufbereiteten Kundenbezeichnung davor.
    expect(vehicleLine).toContain("Baureihe: 3er G20, G21 · Motorisierung: M3 Touring");
  });

  // Mit variant_group "leistung" (heutige, seit Korrektur 15.09.2026
  // gespeicherte Anfragen tragen das Feld immer): sowohl die Positionsliste
  // (displayItemFields()) als auch die Vorher/Nachher-Zeile
  // (lib/catalog/before-after.ts, productDisplay()) falten konsistent -
  // ohne variant_group (nur bei älteren, vor der Korrektur gespeicherten
  // Anfragen) greift für die Vorher/Nachher-Zeile nur der lockere,
  // ps_to-basierte isStageItem()-Fallback, productDisplay() selbst faltet
  // dort NICHT (siehe dessen eigener variant_group==="leistung"-Check) -
  // wie im Flow (components/flow/beforeAfter.ts, dieselbe Semantik),
  // ausserhalb dieser Aufgabe.
  it("buildConfirmation zeigt den gefalteten Positionsnamen (kein voller Excel-Rohname)", () => {
    const ctx = m2Ctx({ items: [{ ...stufe1, variant_group: "leistung" }] });
    const result = buildConfirmation(ctx);
    expect(result.text).toContain("Motor: Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe)");
    expect(result.text).not.toContain("(Basis 480 PS)");
  });

  it("buildSummary zeigt denselben gefalteten Positionsnamen", () => {
    const ctx = m2Ctx({ items: [{ ...stufe1, variant_group: "leistung" }] });
    const result = buildSummary(ctx);
    expect(result.text).toContain("Motor: Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe)");
    expect(result.text).not.toContain("(Basis 480 PS)");
  });

  // Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): die Vorher/Nachher-Zeile
  // "Leistung" steht jetzt in der (farblich hervorgehobenen) Vorher/
  // Nachher-Tabelle (lib/mail/render.ts beforeAfterTable(), Text-Variante),
  // nicht mehr als einzelne "Leistung: ..."-Zeile in der definitionList -
  // nur bei gewählter Leistungsstufe (variant_group "leistung") mit
  // bekannter Serienleistung (inquiries.series_ps).
  it("buildConfirmation zeigt die Vorher/Nachher-Leistungszeile in der Tabelle bei gewählter Stufe", () => {
    const ctx = m2Ctx({ items: [{ ...stufe1, variant_group: "leistung" }] });
    const result = buildConfirmation({ ...ctx, inquiry: { ...ctx.inquiry, series_ps: 480 } });
    // baseModel() liefert series_nm 650 (siehe Fixture oben).
    expect(result.text).toMatch(/Leistung\n  Vorher: 480 PS · 650 Nm\n  Nachher · by dÄHLer: 620 PS · 740 Nm \(\+140 PS \/ \+90 Nm\)/);
    expect(result.html).toContain("28px");
  });

  it("buildSummary zeigt dieselbe Vorher/Nachher-Leistungszeile in der Tabelle", () => {
    const ctx = m2Ctx({ items: [{ ...stufe1, variant_group: "leistung" }] });
    const result = buildSummary({ ...ctx, inquiry: { ...ctx.inquiry, series_ps: 480 } });
    expect(result.text).toMatch(/Leistung\n  Vorher: 480 PS · 650 Nm\n  Nachher · by dÄHLer: 620 PS · 740 Nm \(\+140 PS \/ \+90 Nm\)/);
  });

  it("ohne gewählte Leistungsstufe (variant_group nicht 'leistung') keine Leistungszeile mit Zahlen/Plus", () => {
    // stufe1 im Standard-m2Ctx() trägt kein variant_group (siehe oben).
    const ctx = m2Ctx();
    const result = buildConfirmation({ ...ctx, inquiry: { ...ctx.inquiry, series_ps: 480 } });
    expect(result.text).not.toMatch(/\(\+\d+ PS/);
    expect(result.html).not.toContain("font-size:28px");
  });

  it("ohne bekannte Serienleistung (inquiries.series_ps null) keine Leistungszeile mit Zahlen/Plus", () => {
    const ctx = m2Ctx({ items: [{ ...stufe1, variant_group: "leistung" }] });
    const result = buildConfirmation(ctx); // baseInquiry(): series_ps null
    expect(result.text).not.toMatch(/\(\+\d+ PS/);
    expect(result.html).not.toContain("font-size:28px");
  });
});

// Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): dieselbe, farblich
// hervorgehobene Vorher/Nachher-Übersicht wie im Abschluss-Screen soll auch
// in confirmation/summary erscheinen (inbox als Klartext-Block, eigene
// Prüfung unten) - nicht mehr die einzelne "Leistung: ..."-Zeile.
describe("beforeAfterTable in den Kundenmails", () => {
  const ctx = makeContext({ locale: "de", items: itemsWithPrices, withModel: true });

  it("confirmation zeigt die Tabelle mit Vorher/Nachher-Kopf, Kategorie-Zeilen und Überschrift", () => {
    const result = buildConfirmation(ctx);
    expect(result.html).toContain('class="ba-tbl"');
    expect(result.html).toContain(">Vorher<");
    expect(result.html).toContain("Nachher · by dÄHLer");
    expect(result.html).toContain(">Sound<");
    expect(result.text).toContain("Vorher / Nachher:");
  });

  // Prüfer-Befund (Beleg Anfrage 2026-0272): eine frühere Fassung hielt
  // pro Zeile zwei fertige Markup-Varianten vor und blendete die passende
  // über einen <style>-Block mit @media-Regel ein/aus - Mailclients, die
  // <style> ganz verwerfen (z.B. die Gmail-App bei Nicht-Google-Konten),
  // zeigten dann BEIDE Varianten, jede Zeilenbeschriftung also doppelt.
  // Jetzt genau eine Markup-Variante, rein mit Inline-Styles: kein
  // <style>-Block, jede Zeilenbeschriftung erscheint genau einmal.
  it("confirmation: HTML-Fassung ohne <style>-Block, jede Zeilenbeschriftung genau einmal", () => {
    const result = buildConfirmation(ctx);
    expect(result.html).not.toContain("<style>");
    expect(result.html).not.toContain("@media");
    const rows = buildBeforeAfterRows({
      categories: ctx.inquiry.categories,
      consulting: ctx.inquiry.consulting,
      items: ctx.items,
      character: ctx.inquiry.character,
      seriesPs: ctx.inquiry.series_ps,
      seriesNm: ctx.model?.series_nm ?? null,
      locale: ctx.locale,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const occurrences = result.html.split(`>${row.label}<`).length - 1;
      expect(occurrences).toBe(1);
    }
  });

  it("summary zeigt dieselbe Tabelle", () => {
    const result = buildSummary(ctx);
    expect(result.html).toContain('class="ba-tbl"');
    expect(result.text).toContain("Vorher / Nachher:");
  });

  // Leistungsstufe im Fixture itemsWithPrices ("Stufe 1"), aber ohne
  // gesetztes series_ps -> kein power, die Tabelle zeigt trotzdem die
  // Text-Fallback-Zeile für "Leistung" (before/after als Text).
  it("confirmation: Text-Variante enthält je gewählter Kategorie eine ausgerichtete Zeile", () => {
    const result = buildConfirmation(ctx);
    expect(result.text).toMatch(/Leistung\n  Vorher: .+\n  Nachher · by dÄHLer: .+/);
    expect(result.text).toMatch(/Sound\n  Vorher: Serienanlage\n  Nachher · by dÄHLer: Klappenauspuffanlage/);
  });

  // Mit gewählter Leistungsstufe UND bekannter Serienleistung: grosse
  // Zahlen (28px) und grüner Plus-Badge in der HTML-Fassung, wie
  // components/ui/PowerValue.tsx im Flow.
  it("confirmation zeigt bei gewählter Stufe grosse Zahlen und einen grünen Plus-Badge", () => {
    const ctxWithSeries = makeContext({ locale: "de", items: itemsWithPrices, withModel: true });
    const result = buildConfirmation({
      ...ctxWithSeries,
      inquiry: { ...ctxWithSeries.inquiry, series_ps: 480 },
      items: [{ ...itemsWithPrices[0], variant_group: "leistung", ps_to: 620, nm_to: 740 }, itemsWithPrices[1]],
    });
    expect(result.html).toContain("font-size:28px");
    expect(result.html).toContain("background:#e7f8ef"); // Plus-Badge-Hintergrund (grün)
    expect(result.text).toMatch(/\(\+\d+ PS/);
  });

  it("reply zeigt die Tabelle NICHT (nur der bearbeitete Antwortentwurf)", () => {
    const result = buildReply(ctx);
    expect(result.html).not.toContain('class="ba-tbl"');
    expect(result.text).not.toContain("Vorher / Nachher:");
  });

  // Alte einzelne "Leistung: ..."-Zeile (frühere definitionList()-Zeile,
  // vor der Tabelle) darf nicht mehr auftauchen - keine Doppelung.
  it("keine Doppelung der alten 'Leistung: ...'-Zeile aus der definitionList", () => {
    const ctxWithSeries = makeContext({ locale: "de", items: itemsWithPrices, withModel: true });
    const result = buildConfirmation({ ...ctxWithSeries, inquiry: { ...ctxWithSeries.inquiry, series_ps: 480 } });
    expect(result.text).not.toContain("Leistung: ");
    expect(result.html).not.toContain(">Leistung:<");
  });

  // Kurzablauf (Punkt 3): ohne Kategorien und ohne Komplettpaket keine
  // Tabelle.
  it("ohne Kategorien und ohne Komplettpaket: keine Tabelle", () => {
    const ctxEmpty = makeContext({ locale: "de", items: [], withModel: true });
    const result = buildConfirmation({
      ...ctxEmpty,
      inquiry: { ...ctxEmpty.inquiry, categories: [], consulting: false },
    });
    expect(result.html).not.toContain('class="ba-tbl"');
    expect(result.text).not.toContain("Vorher / Nachher:");
  });

  // Kurzablauf mit gewählten Kategorien, aber ganz ohne Produkte (z.B.
  // Wiesmann, Familie ohne Preisliste): Tabelle zeigt "Serie -> Beratung"
  // je gewählter Kategorie, wie im Flow.
  it("Kurzablauf mit Kategorien ohne Produkte: Tabelle zeigt Serie -> Beratung", () => {
    const ctxQuick = makeContext({ locale: "en", items: [], withModel: false });
    const result = buildConfirmation(ctxQuick);
    expect(result.html).toContain('class="ba-tbl"');
    expect(result.text).toMatch(/Power\n  Before: Standard\n  After · by dÄHLer: Advice/);
  });

  it("inbox zeigt die Übersicht als kompakten Klartext-Block (Monospace), nach GESCHÄTZTES PAKET", () => {
    const result = buildInbox(ctx);
    expect(result.html).toContain("<pre");
    expect(result.text).toContain("VORHER / NACHHER");
    const packageIdx = result.text.indexOf("GESCHÄTZTES PAKET");
    const baIdx = result.text.indexOf("VORHER / NACHHER");
    expect(packageIdx).toBeGreaterThan(-1);
    expect(baIdx).toBeGreaterThan(packageIdx);
  });
});
