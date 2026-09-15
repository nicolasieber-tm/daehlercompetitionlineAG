// Volltext-Snapshots für buildDraft(): M2 G87 mit Stufe 1 + Komplettanlage +
// Sportfedern (timing m1_2, character sportlich, de und en) und der
// Kurzablauf (Wiesmann ohne Preisliste). Produktnamen/-preise sind echte
// Werte aus der Erstbefüllung (M2 G87, siehe docs/db.md), keine DB-
// Abfrage nötig: buildDraft() ist eine reine Funktion.
import { describe, expect, it } from "vitest";
import { buildDraft } from "@/lib/draft/template";
import type { DraftContext, DraftItem, DraftSettings } from "@/lib/draft/template";
import { vehicleLabel } from "@/lib/mail/render";
import type { ModelFamily } from "@/lib/supabase/rows";

// companyName (settings.mail_from_name) + companyAddress (settings.
// company_address, hier "Belp") ergeben zusammen dieselbe Firmenzeile wie
// vorher ("dÄHLer Competition Line AG, Belp") - Prüfung Phase B, Punkt 6:
// Firmenname kommt jetzt aus companyName, companyAddress ist die separate,
// nur bei Vorhandensein angehängte Adresse (siehe lib/draft/template.ts).
const SETTINGS = {
  signatureName: "Christoph Dähler",
  companyName: "dÄHLer Competition Line AG",
  companyAddress: "Belp",
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
    vehicleLabel: "BMW M2 (G87)",
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
  "Danke für Ihre Anfrage für Ihren BMW M2 (G87), Jahrgang 2025. Sportlich und alltagstauglich, das ist genau unsere Linie.",
  [
    "Grundsätzlich können wir das so umsetzen:",
    // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
    // Positionszeile jetzt über lib/catalog/product-display.ts
    // displayItemFields() zusammengefaltet, statt des vollen, mehrdeutigen
    // Excel-Rohnamens (siehe lib/draft/template.ts buildItemLine()).
    "• Motor: Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe), ab CHF 4'180",
    "• Auspuff: Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre, ab CHF 5'260",
    "• Fahrwerk: Sportfedernsatz für M2 / VA -20mm/ HA -14mm, ab CHF 1'630",
  ].join("\n"),
  "Mit Stufe 1 kommt Ihr BMW M2 (G87) auf 620 PS / 740 Nm, WLTP-geprüft und mit CH-Gutachten. Die Ergänzungsgarantie zur Werksgarantie ist für ein Jahr inbegriffen.",
  "Richtpreis für das Paket: ab CHF 11'070, inklusive Einbau, ohne MFK. Den definitiven Preis bestätigen wir Ihnen, sobald wir wissen, ob Ihr Wagen das adaptive M-Fahrwerk hat.",
  "Für die Zeit in ein bis zwei Monaten haben wir Werkstattfenster, wir reservieren Ihnen gerne eines, sobald Sie grünes Licht geben.",
  "Rufen Sie uns an oder antworten Sie kurz auf diese Mail, dann besprechen wir die Details.",
  ["Sportliche Grüsse aus Belp", "Christoph Dähler", "dÄHLer Competition Line AG, Belp · +41 31 819 88 77"].join("\n"),
].join("\n\n");

const M2_BODY_EN = [
  "Dear Max Muster",
  "Thank you for your request for your BMW M2 (G87), model year 2025. Sporty and still practical for everyday use, that is exactly our line.",
  [
    "In principle, we can put this together:",
    "• Engine: Stage 1 (620 PS / 740 Nm, M6 & A8-Getriebe), from CHF 4'180",
    "• Exhaust: Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre, from CHF 5'260",
    "• Suspension: Sportfedernsatz für M2 / VA -20mm/ HA -14mm, from CHF 1'630",
  ].join("\n"),
  "With Stufe 1 your BMW M2 (G87) reaches 620 PS / 740 Nm, WLTP tested and with a Swiss approval certificate. The one year warranty extension to the factory warranty is included.",
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
  "Den Richtpreis nennen wir Ihnen nach kurzer Prüfung, inklusive Einbau, ohne MFK. Den definitiven Preis bestätigen wir Ihnen, sobald wir die Details geklärt haben.",
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
    expect(subject).toBe("Ihre Anfrage für den BMW M2 (G87), Nr. 2026-0012");
    expect(body).toBe(M2_BODY_DE);
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("en: Betreff und Volltext", () => {
    const { subject, body } = buildDraft(m2Ctx(), "en");
    expect(subject).toBe("Your request for the BMW M2 (G87), No. 2026-0012");
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

// --- Kurzablauf mit Platzhalterfamilie ("Älteres Modell", siehe
// supabase/seed.sql, kein Modell); ctx.vehicleLabel entsteht hier wie in
// lib/inquiry/create.ts über die echte vehicleLabel()-Funktion aus
// lib/mail/render.ts (nicht hart verdrahtet), damit der Test die
// tatsächliche Pipeline prüft statt nur buildDraft() isoliert.
//
// Prüfung Punkt 1 (blocker, seinerzeit): der Familienname bleibt in JEDEM
// Fall stehen, auch bei den drei Kurzablauf-Platzhalternamen, keine
// Code-Logik über model_families.codes.
//
// Prüfung Punkt 3 (Folgeprüfung): vehicle_text ist bei einer Familie OHNE
// Modell-Katalog (has_pricelist false, hier also auch ohne gewähltes
// model) jetzt wieder ein Ersatz für das fehlende Modell - anders als die
// vorige Fassung, die vehicle_text nur ohne jede bekannte Familie
// berücksichtigte, siehe lib/catalog/vehicle-label.ts: ohne diese
// Ergänzung könnte eine Platzhalterfamilie (Älteres Modell, Wiesmann) die
// vom Kunden/Sprachmodell erfasste konkrete Modellbezeichnung nirgends
// zeigen.
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

describe("buildDraft: Kurzablauf Platzhalterfamilie (docs/architektur.md, Abschnitt 'Fahrzeugbezeichnung', Regel 4)", () => {
  it("ohne vehicleText: Marke + Platzhalter-Familienname (einzig verfügbarer Anhaltspunkt)", () => {
    const { subject, body } = buildDraft(kurzablaufCtx(null), "de");
    expect(subject).toBe("Ihre Anfrage für den BMW Älteres Modell, Nr. 2026-0099");
    expect(body).toContain("Danke für Ihre Anfrage für Ihren BMW Älteres Modell.");
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("mit vehicleText: Marke + vehicleText, der nichtssagende Platzhaltername bleibt weg (kein doppeltes Lesen, Kundenrückmeldung)", () => {
    const { subject, body } = buildDraft(kurzablaufCtx("320i Touring, Baujahr ca. 2011"), "de");
    expect(subject).toBe("Ihre Anfrage für den BMW 320i Touring, Baujahr ca. 2011, Nr. 2026-0099");
    expect(body).toContain("Danke für Ihre Anfrage für Ihren BMW 320i Touring, Baujahr ca. 2011.");
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

// Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
// die beiden M2 G87 Stufe-1-Positionen (Basis 480 PS), die im Motor-Schritt
// vorher identisch aussahen, müssen sich jetzt auch im Antwortentwurf klar
// unterscheiden lassen.
const STUFE_1_VMAX: DraftItem = {
  category: "motor",
  name: "Stufe 1: (Basis 480 PS) 640PS / 770Nm (M6 & A8-Getriebe)  inkl. Anhebung der V/max Begrenzung",
  description: null,
  priceTotal: 4980,
  priceStatus: "priced",
  psTo: 640,
  nmTo: 770,
  variantGroup: "leistung",
};

describe("buildDraft: die beiden M2 G87 Stufe-1-Positionen (Basis 480 PS) sind unterscheidbar", () => {
  it("ohne und mit V/max-Aufhebung ergeben unterschiedliche Positionszeilen", () => {
    const ctxWithout = { ...m2Ctx(), items: [STUFE_1] };
    const ctxWith = { ...m2Ctx(), items: [STUFE_1_VMAX] };
    const { body: bodyWithout } = buildDraft(ctxWithout, "de");
    const { body: bodyWith } = buildDraft(ctxWith, "de");
    expect(bodyWithout).toContain("• Motor: Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe), ab CHF 4'180");
    expect(bodyWith).toContain("• Motor: Stufe 1 mit V/max-Aufhebung (640 PS / 770 Nm, M6 & A8-Getriebe), ab CHF 4'980");
  });
});

// Prüfung Modul Parser, Befund 1: "... ohne Leistungssteigerung" liegt
// bewusst in variant_group "leistung" (Exklusivität, siehe
// lib/catalog/variant-groups.ts), ist aber KEINE Stufe. Vor der Korrektur
// wählte buildItemLine() hier fälschlich isStage über variantGroup allein
// (ohne psTo-Bezug) und zeigte "Leistungssteigerung mit V/max-Aufhebung"
// statt des tatsächlichen Produktnamens.
const VMAX_OHNE_LEISTUNGSSTEIGERUNG: DraftItem = {
  category: "motor",
  name: "Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung",
  description: null,
  priceTotal: 2230,
  priceStatus: "priced",
  psTo: null,
  nmTo: null,
  variantGroup: "leistung",
};

describe("buildDraft: eigenständiges V/max-Produkt 'ohne Leistungssteigerung' (Befund 1)", () => {
  it("erscheint mit dem tatsächlichen Produktnamen, nicht als 'Leistungssteigerung mit V/max-Aufhebung'", () => {
    const ctx = { ...m2Ctx(), items: [VMAX_OHNE_LEISTUNGSSTEIGERUNG], estimatedTotal: 2230 };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain(
      "• Motor: Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung, ab CHF 2'230",
    );
    expect(body).not.toContain("Leistungssteigerung mit V/max-Aufhebung");
  });
});

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

// --- Prüfung Phase B, Punkt 7: character/timing können im Schnellweg
// (Posten 3) null sein, wenn das Sprachmodell sie nicht extrahieren konnte
// und der Admin sie (noch) nicht nachgetragen hat (siehe
// lib/ai/to-payload.ts QuickInquiryPayloadSchema). buildDraft() muss dann
// neutrale Sätze statt eines kaputten "undefined" liefern.
describe("buildDraft: character/timing null (Schnellweg ohne erkannten Charakter/Termin)", () => {
  it("character null: der Charakter-Satz entfällt, der Rest des Dank-Absatzes bleibt", () => {
    const ctx = { ...m2Ctx(), character: null };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain("Danke für Ihre Anfrage für Ihren BMW M2 (G87), Jahrgang 2025.");
    expect(body).not.toContain("undefined");
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("timing null: ein neutraler Satz ersetzt die Zeitraum-Zeile", () => {
    const ctx = { ...m2Ctx(), timing: null };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain(
      "Sobald wir Ihren Wunschtermin kennen, reservieren wir Ihnen gerne ein Werkstattfenster.",
    );
    expect(body).not.toContain("undefined");
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("character UND timing null zusammen (typischer Schnellweg-Rohzustand)", () => {
    const ctx = { ...m2Ctx(), character: null, timing: null };
    const { subject, body } = buildDraft(ctx, "de");
    expect(subject).toBe("Ihre Anfrage für den BMW M2 (G87), Nr. 2026-0012");
    expect(body).not.toContain("undefined");
    assertClean(body, SETTINGS.signaturePhone);
  });
});

// --- Prüfung Phase B, Punkt 6: Signatur ohne gesetzte Adresse.
describe("buildDraft: Signatur ohne company_address", () => {
  it("companyAddress leer: nur der Firmenname aus companyName, keine hängende Adresse/Komma", () => {
    const ctx = { ...m2Ctx(), settings: { ...SETTINGS, companyAddress: "" } };
    const { body } = buildDraft(ctx, "de");
    expect(body.endsWith("dÄHLer Competition Line AG · +41 31 819 88 77")).toBe(true);
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("ohne companyName (z.B. ein älterer, so gespeicherter Entwurf): Fallback auf companyAddress allein", () => {
    const settingsWithoutCompanyName: DraftSettings = {
      signatureName: SETTINGS.signatureName,
      companyAddress: "dÄHLer Competition Line AG, Belp",
      signaturePhone: SETTINGS.signaturePhone,
    };
    const ctx = { ...m2Ctx(), settings: settingsWithoutCompanyName };
    const { body } = buildDraft(ctx, "de");
    expect(body.endsWith("dÄHLer Competition Line AG, Belp · +41 31 819 88 77")).toBe(true);
  });

  // Befund «polish» #1: companyAddress kann selbst bereits mit companyName
  // beginnen (der ausgelieferte Seed-Wert von company_address ist "dÄHLer
  // Competition Line AG, Belp", nicht die reine Adresse) - dann darf der
  // Name nicht ein zweites Mal davorgesetzt werden. Deckt genau den Fall
  // ab, den lib/inquiry/create.ts (Prüfung, Befund 4: liefert companyName =
  // settings.mail_from_name jetzt mit) und lib/admin/inquiries.ts
  // regenerateDraft() produzieren (siehe companyLine() in
  // lib/mail/render.ts, dieselbe Korrektur, mit der
  // lib/mail/templates/follow_up.ts das für den tatsächlichen
  // Follow-up-Versand bereits macht).
  it("companyName gesetzt UND companyAddress beginnt bereits mit companyName: keine doppelte Firmenzeile", () => {
    const settingsWithOverlap: DraftSettings = {
      signatureName: SETTINGS.signatureName,
      companyName: "dÄHLer Competition Line AG",
      companyAddress: "dÄHLer Competition Line AG, Belp",
      signaturePhone: SETTINGS.signaturePhone,
    };
    const ctx = { ...m2Ctx(), settings: settingsWithOverlap };
    const { body } = buildDraft(ctx, "de");
    expect(body.endsWith("dÄHLer Competition Line AG, Belp · +41 31 819 88 77")).toBe(true);
    expect(body).not.toContain("dÄHLer Competition Line AG, dÄHLer Competition Line AG");
  });
});
