// Volltext-Snapshots für buildDraft(): M2 G87 mit Stufe 1 + Komplettanlage +
// Sportfedern (timing m1_2, character sportlich, de und en) und der
// Kurzablauf (Wiesmann ohne Preisliste). Produktnamen/-preise sind echte
// Werte aus der Erstbefüllung (M2 G87, siehe docs/db.md), keine DB-
// Abfrage nötig: buildDraft() ist eine reine Funktion.
import { describe, expect, it } from "vitest";
import { buildDraft } from "@/lib/draft/template";
import type { DraftContext, DraftItem } from "@/lib/draft/template";
import { vehicleLabel } from "@/lib/mail/render";
import type { ModelFamily } from "@/lib/supabase/rows";

const SETTINGS = {
  signatureName: "Christoph Dähler",
  companyAddress: "dÄHLer Competition Line AG, Belp",
  signaturePhone: "+41 31 819 88 77",
};

// Reale M2 G87 Produkte (Familie m2-g87, Modell M2), siehe docs/db.md.
const STUFE_1: DraftItem = {
  category: "motor",
  name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe)",
  description: null,
  priceTotal: 4180,
  priceStatus: "priced",
  psTo: 620,
  nmTo: 740,
  variantGroup: "leistung",
};
const KOMPLETTANLAGE: DraftItem = {
  category: "auspuff",
  name: "Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre",
  description: null,
  priceTotal: 5260,
  priceStatus: "priced",
  psTo: null,
  nmTo: null,
  variantGroup: "anlage",
};
const SPORTFEDERN: DraftItem = {
  category: "fahrwerk",
  name: "Sportfedernsatz für M2 / VA -20mm/ HA -14mm",
  description: null,
  priceTotal: 1630,
  priceStatus: "priced",
  psTo: null,
  nmTo: null,
  variantGroup: "fahrwerk",
};

function m2Ctx(): DraftContext {
  return {
    number: "2026-0012",
    firstName: "Max",
    lastName: "Muster",
    vehicleLabel: "BMW M2 G87",
    year: "2025",
    character: "sportlich",
    categories: ["motor", "auspuff", "fahrwerk"],
    consulting: false,
    timing: "m1_2",
    hasPricelist: true,
    items: [STUFE_1, KOMPLETTANLAGE, SPORTFEDERN],
    estimatedTotal: 4180 + 5260 + 1630,
    settings: SETTINGS,
  };
}

const M2_BODY_DE = [
  "Guten Tag Max Muster",
  "Danke für Ihre Anfrage für Ihren BMW M2 G87 (Jahrgang 2025). Sportlich und alltagstauglich, das ist genau unsere Linie.",
  [
    "Grundsätzlich können wir das so umsetzen:",
    "• Motor: Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe), ab CHF 4'180",
    "• Auspuff: Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre, ab CHF 5'260",
    "• Fahrwerk: Sportfedernsatz für M2 / VA -20mm/ HA -14mm, ab CHF 1'630",
  ].join("\n"),
  "Mit Stufe 1 kommt Ihr BMW M2 G87 auf 620 PS / 740 Nm, WLTP-geprüft und mit CH-Gutachten. Die Ergänzungsgarantie zur Werksgarantie ist für ein Jahr inbegriffen.",
  "Richtpreis für das Paket: ab CHF 11'070, inklusive Einbau, ohne MFK. Den definitiven Preis bestätige ich Ihnen, sobald wir wissen, ob Ihr Wagen das adaptive M-Fahrwerk hat.",
  "Für die Zeit in ein bis zwei Monaten haben wir Werkstattfenster, wir reservieren Ihnen gerne eines, sobald Sie grünes Licht geben.",
  "Rufen Sie uns an oder antworten Sie kurz auf diese Mail, dann besprechen wir die Details.",
  ["Sportliche Grüsse aus Belp", "Christoph Dähler", "dÄHLer Competition Line AG, Belp · +41 31 819 88 77"].join("\n"),
].join("\n\n");

const M2_BODY_EN = [
  "Dear Max Muster",
  "Thank you for your request for your BMW M2 G87 (model year 2025). Sporty and still practical for everyday use, that is exactly our line.",
  [
    "In principle, we can put this together:",
    "• Engine: Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe), from CHF 4'180",
    "• Exhaust: Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre, from CHF 5'260",
    "• Suspension: Sportfedernsatz für M2 / VA -20mm/ HA -14mm, from CHF 1'630",
  ].join("\n"),
  "With Stufe 1 your BMW M2 G87 reaches 620 PS / 740 Nm, WLTP tested and with a Swiss approval certificate. The one year warranty extension to the factory warranty is included.",
  "Indicative price for the package: from CHF 11'070, including fitting, excluding roadworthiness test. We will confirm the final price once we know whether your car has the adaptive M suspension.",
  "For the period in one to two months we have workshop slots available, we would be happy to reserve one for you once you give us the go ahead.",
  "Call us or simply reply to this email, and we will discuss the details.",
  ["Kind regards from Belp", "Christoph Dähler", "dÄHLer Competition Line AG, Belp · +41 31 819 88 77"].join("\n"),
].join("\n\n");

function wiesmannCtx(): DraftContext {
  return {
    number: "2026-0045",
    firstName: "Peter",
    lastName: "Beispiel",
    vehicleLabel: "Wiesmann",
    year: "älter",
    character: "dezent",
    categories: ["motor", "exterieur"],
    consulting: false,
    timing: "flexible",
    hasPricelist: false,
    items: [],
    estimatedTotal: null,
    settings: SETTINGS,
  };
}

const WIESMANN_BODY_DE = [
  "Guten Tag Peter Beispiel",
  "Danke für Ihre Anfrage für Ihren Wiesmann. Dezent und trotzdem spürbar, das können wir.",
  ["Grundsätzlich können wir das so umsetzen:", "• Motor", "• Exterieur"].join("\n"),
  "Den Richtpreis nennen wir Ihnen nach kurzer Prüfung, inklusive Einbau, ohne MFK.",
  "Beim Termin sind wir flexibel, sagen Sie uns einfach, was Ihnen passt.",
  "Rufen Sie uns an oder antworten Sie kurz auf diese Mail, dann besprechen wir die Details.",
  ["Sportliche Grüsse aus Belp", "Christoph Dähler", "dÄHLer Competition Line AG, Belp · +41 31 819 88 77"].join("\n"),
].join("\n\n");

/** Jede Zeile grammatisch prüfen: keine doppelten Leerzeichen, kein
 * unersetzter Platzhalter, keine Gedankenstriche, endet mit der Signatur. */
function assertClean(body: string, phone: string): void {
  for (const line of body.split("\n")) {
    expect(line, `Zeile ohne doppelte Leerzeichen: "${line}"`).not.toMatch(/ {2,}/);
  }
  expect(body, "kein unersetzter Platzhalter").not.toMatch(/\{[a-zA-Z]/);
  expect(body, "keine Gedankenstriche").not.toMatch(/[‒–—―]/);
  expect(body.endsWith(phone), "endet mit der Signatur (Telefonnummer)").toBe(true);
}

describe("buildDraft: M2 G87, Stufe 1 + Komplettanlage + Sportfedern, timing m1_2, character sportlich", () => {
  it("de: Betreff und Volltext", () => {
    const { subject, body } = buildDraft(m2Ctx(), "de");
    expect(subject).toBe("Ihre Anfrage für den BMW M2 G87, Nr. 2026-0012");
    expect(body).toBe(M2_BODY_DE);
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("en: Betreff und Volltext", () => {
    const { subject, body } = buildDraft(m2Ctx(), "en");
    expect(subject).toBe("Your request for the BMW M2 G87, No. 2026-0012");
    expect(body).toBe(M2_BODY_EN);
    assertClean(body, SETTINGS.signaturePhone);
  });
});

describe("buildDraft: Kurzablauf Wiesmann ohne Preise", () => {
  it("de: Betreff und Volltext, Positionen als Kategorien-Wunschliste, kein Leistungssatz", () => {
    const { subject, body } = buildDraft(wiesmannCtx(), "de");
    expect(subject).toBe("Ihre Anfrage für den Wiesmann, Nr. 2026-0045");
    expect(body).toBe(WIESMANN_BODY_DE);
    assertClean(body, SETTINGS.signaturePhone);
  });
});

// --- Regression Befund #1 (Anfrage-Prüfung): Kurzablauf mit
// inquiries.vehicle_text. Die Platzhalterfamilie "Älteres Modell" (siehe
// supabase/seed.sql) hat kein Modell; ctx.vehicleLabel entsteht hier wie in
// lib/inquiry/create.ts über die echte vehicleLabel()-Funktion aus
// lib/mail/render.ts (nicht hart verdrahtet), damit der Test die
// tatsächliche Pipeline prüft statt nur buildDraft() isoliert.
const PLACEHOLDER_FAMILY: ModelFamily = {
  active: true,
  brand: "BMW",
  codes: [],
  created_at: "2026-01-01T00:00:00.000Z",
  has_pricelist: false,
  id: "44444444-4444-4444-4444-444444444444",
  name: "Älteres Modell",
  photo_url: null,
  pricelist_no: null,
  short_text: null,
  slug: "bmw-aelteres-modell",
  sort: 999,
  source_file: null,
  updated_at: "2026-01-01T00:00:00.000Z",
};

function kurzablaufCtx(vehicleText: string | null): DraftContext {
  return {
    number: "2026-0099",
    firstName: "Sandra",
    lastName: "Käser",
    vehicleLabel: vehicleLabel({ family: PLACEHOLDER_FAMILY, model: null, vehicleText }),
    year: "älter",
    character: "dezent",
    categories: ["motor"],
    consulting: false,
    timing: "flexible",
    hasPricelist: false,
    items: [],
    estimatedTotal: null,
    settings: SETTINGS,
  };
}

describe("buildDraft: Kurzablauf Platzhalterfamilie mit vehicle_text (Befund #1 der Anfrage-Prüfung)", () => {
  it("mit vehicleText: der vom Kunden genannte Fahrzeugtext erscheint statt des Platzhalternamens", () => {
    const { subject, body } = buildDraft(kurzablaufCtx("320i Touring, Baujahr ca. 2011"), "de");
    expect(subject).toBe("Ihre Anfrage für den 320i Touring, Baujahr ca. 2011, Nr. 2026-0099");
    expect(body).toContain("Danke für Ihre Anfrage für Ihren 320i Touring, Baujahr ca. 2011.");
    expect(body).not.toContain("Älteres Modell");
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("ohne vehicleText: nur die Marke statt des grammatisch falschen Platzhalternamens", () => {
    const { subject, body } = buildDraft(kurzablaufCtx(null), "de");
    expect(subject).toBe("Ihre Anfrage für den BMW, Nr. 2026-0099");
    expect(body).toContain("Danke für Ihre Anfrage für Ihren BMW.");
    expect(body).not.toContain("Älteres Modell");
    assertClean(body, SETTINGS.signaturePhone);
  });
});

// --- Regression Befund #2 (Anfrage-Prüfung): itemLineText()-Positionszeile
// mit mehrzeiliger Radsatz-Beschreibung (echte Zeilenumbrüche aus der
// Excel-Zelle, Vorder-/Hinterachse getrennt) über buildItemLine() - alle
// bisherigen Draft-Tests nutzen description: null und deckten das nicht ab.
const RADSATZ: DraftItem = {
  category: "raeder",
  name: "CDC1 FORGED Radsatz geschmiedet bestehend aus:",
  description: '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20',
  priceTotal: 7100,
  priceStatus: "priced",
  psTo: null,
  nmTo: null,
  variantGroup: null,
};

describe("buildDraft: Positionszeile mit mehrzeiliger Beschreibung (Befund #2 der Anfrage-Prüfung)", () => {
  it("Radsatz-Beschreibung ohne Zeilenumbruch in der Positionszeile, kein Doppelpunkt vor der Klammer", () => {
    const ctx = { ...m2Ctx(), items: [RADSATZ], estimatedTotal: 7100 };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain(
      '• Räder: CDC1 FORGED Radsatz geschmiedet bestehend aus (10 x 20" mit 275/30 20, 10 x 20" mit 285/30 20), ab CHF 7\'100',
    );
    assertClean(body, SETTINGS.signaturePhone);
  });
});
