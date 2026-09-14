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
import type { MailCheck, MailFollowUpContext, MailInquiryContext, MailInquiryItem } from "@/lib/mail/types";
import type { Inquiry, Model, ModelFamily } from "@/lib/supabase/rows";
import type { Locale } from "@/lib/i18n";

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

const DASH_RE = /[–—]/; // – / —
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
          }
          if (variant.label === "mit Preisen") {
            expect(result.html).toContain("CHF 4'180");
          }
        });

        it("summary", () => {
          const result = buildSummary(ctx);
          expectWellFormed(result);
          for (const item of variant.items) {
            expect(result.html).toContain(item.name);
          }
          if (variant.label === "mit Preisen") {
            expect(result.html).toContain("CHF 4'180");
          }
        });

        it("inbox (immer Deutsch)", () => {
          const result = buildInbox(ctx);
          expectWellFormed(result);
          for (const item of variant.items) {
            expect(result.html).toContain(item.name);
          }
          expect(result.html).toContain(checks[0].text);
        });

        it("reply", () => {
          const result = buildReply(ctx);
          expectWellFormed(result);
          expect(result.subject).toBe(draft.subject);
          expect(result.html).toContain("CHF 4'180");
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
