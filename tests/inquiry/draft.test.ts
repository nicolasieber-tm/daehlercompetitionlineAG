// Volltext-Snapshots für buildDraft(): M2 G87 mit Stufe 1 + Komplettanlage +
// Sportfedern (timing m1_2, character sportlich, de und en) und der
// Kurzablauf (Wiesmann ohne Preisliste). Produktnamen/-preise sind echte
// Werte aus der Erstbefüllung (M2 G87, siehe docs/db.md), keine DB-
// Abfrage nötig: buildDraft() ist eine reine Funktion.
import { describe, expect, it } from "vitest";
import { buildDraft } from "@/lib/draft/template";
import type { DraftContext, DraftItem, DraftSettings } from "@/lib/draft/template";
import { vehicleLabel } from "@/lib/mail/render";
import type { ModelFamily } from "@/lib/db/rows";

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

// Rückmeldung dÄHLer 28.10.2026: Standardtexte nach seiner Beispielmail
// (lib/mail/texts.ts), Positionen nach Bereich gruppiert mit Strichen.
const INTRO_DE = "Vielen Dank für Ihre Anfrage und Ihr Interesse an einer individuellen Lösung von dÄHLer für Ihren";
const MODEL_DE = "Der BMW M2 verbindet pure Sportlichkeit mit beeindruckender Alltagstauglichkeit.";
const LEAD_DE = `${MODEL_DE} Spürbar mehr Leistung, eine sportliche Klangkulisse und ein präzises Fahrverhalten, sportlich und präzise abgestimmt, genau hier setzen wir bei dÄHLer an.`;
const ITEMS_INTRO_DE = "Für Ihren BMW M2 bieten wir Ihnen Folgendes an:";
const QUESTION_FAHRWERK_DE =
  "Damit wir Ihnen ein exakt auf Ihr Fahrzeug abgestimmtes Angebot erstellen können, bitten wir Sie noch um eine kurze Rückmeldung, ob Ihr BMW M2 mit dem adaptiven M-Fahrwerk ausgestattet ist. Anschliessend können wir die Details prüfen und Ihnen den definitiven Preis bestätigen.";
const QUESTION_GENERIC_DE =
  "Damit wir Ihnen ein exakt auf Ihr Fahrzeug abgestimmtes Angebot erstellen können, prüfen wir die gewünschte Ausführung. Anschliessend bestätigen wir Ihnen gerne den definitiven Preis.";
const TIMING_DE =
  "Gerne übernehmen wir die fachgerechte Montage bei uns in Belp. Für die kommenden Wochen können wir Ihnen bereits passende Werkstatttermine anbieten und reservieren Ihnen gerne einen Termin, sobald Sie sich für die Umsetzung entschieden haben.";
const CLOSING_DE = [
  "Wenn Sie Fragen haben oder die Ausführung im Detail mit uns besprechen möchten, freuen wir uns auf Ihren Anruf oder Ihre kurze Rückmeldung per E-Mail.",
  "Wir würden uns freuen, Ihren BMW M2 gemeinsam mit Ihnen noch individueller zu gestalten.",
  ["Sportliche Grüsse aus Belp", "Christoph Dähler", "dÄHLer Competition Line AG, Belp · +41 31 819 88 77"].join("\n"),
].join("\n\n");

const M2_BODY_DE = [
  "Guten Tag Max Muster",
  `${INTRO_DE} BMW M2 (G87), Jahrgang 2025.`,
  LEAD_DE,
  ITEMS_INTRO_DE,
  [
    ["Motor", "- Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe), ab CHF 4'180"].join("\n"),
    ["Auspuff", "- Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre, ab CHF 5'260"].join("\n"),
    ["Fahrwerk", "- Sportfedernsatz für M2 / VA -20mm/ HA -14mm, ab CHF 1'630"].join("\n"),
  ].join("\n\n"),
  "Mit Stufe 1 kommt Ihr BMW M2 (G87) auf 620 PS / 740 Nm, WLTP-geprüft und mit CH-Gutachten. Die Ergänzungsgarantie zur Werksgarantie ist für ein Jahr inbegriffen.",
  "Richtpreis für das Gesamtpaket: ab CHF 11'070, inklusive Montage, exklusive MFK.",
  QUESTION_FAHRWERK_DE,
  TIMING_DE,
  CLOSING_DE,
].join("\n\n");

const M2_BODY_EN = [
  "Dear Max Muster",
  "Thank you for your enquiry and your interest in an individual dÄHLer solution for your BMW M2 (G87), model year 2025.",
  "The BMW M2 combines pure sportiness with impressive everyday usability. Noticeably more power, a sporty sound and precise handling, sporty and precisely set up, is exactly where we at dÄHLer come in.",
  "For your BMW M2 we can offer you the following:",
  [
    ["Engine", "- Stage 1 (620 PS / 740 Nm, M6 & A8-Getriebe), from CHF 4'180"].join("\n"),
    ["Exhaust", "- Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre, from CHF 5'260"].join("\n"),
    ["Suspension", "- Sportfedernsatz für M2 / VA -20mm/ HA -14mm, from CHF 1'630"].join("\n"),
  ].join("\n\n"),
  "With Stage 1 your BMW M2 (G87) reaches 620 PS / 740 Nm, WLTP tested and with a Swiss approval certificate. The one year warranty extension to the factory warranty is included.",
  "Indicative price for the complete package: from CHF 11'070, including fitting, excluding roadworthiness test.",
  "So that we can prepare an offer that is precisely matched to your car, we would ask you for a brief reply on whether your BMW M2 is equipped with the adaptive M suspension. We can then check the details and confirm the final price to you.",
  "We would be happy to carry out the professional fitting at our workshop in Belp. We can already offer you suitable workshop dates for the coming weeks and will be glad to reserve a date for you as soon as you have decided to go ahead.",
  [
    "If you have any questions or would like to discuss the details with us, we look forward to your call or a brief reply by e-mail.",
    "We would be delighted to make your BMW M2 even more individual together with you.",
    ["Sporty greetings from Belp", "Christoph Dähler", "dÄHLer Competition Line AG, Belp · +41 31 819 88 77"].join("\n"),
  ].join("\n\n"),
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
  `${INTRO_DE} Wiesmann.`,
  "Der Wiesmann verbindet pure Sportlichkeit mit beeindruckender Alltagstauglichkeit. Spürbar mehr Leistung und ein markanter Auftritt, dezent und stilsicher umgesetzt, genau hier setzen wir bei dÄHLer an.",
  "Für Ihren Wiesmann bieten wir Ihnen Folgendes an:",
  ["- Motor", "- Exterieur"].join("\n"),
  "Den Richtpreis nennen wir Ihnen nach kurzer Prüfung, inklusive Montage, exklusive MFK.",
  QUESTION_GENERIC_DE,
  TIMING_DE,
  CLOSING_DE.replace("BMW M2", "Wiesmann"),
].join("\n\n");

/** Jede Zeile grammatisch prüfen: keine doppelten Leerzeichen, kein
 * unersetzter Platzhalter, keine Gedankenstriche, endet mit der Signatur. */
function assertClean(body: string, phone: string): void {
  for (const line of body.split("\n")) {
    // Führende Einrückung (Achszeilen eines Radsatzes) ist gewollt.
    expect(line.trimStart(), `Zeile ohne doppelte Leerzeichen: "${line}"`).not.toMatch(/ {2,}/);
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
// db/seed.sql, kein Modell); ctx.vehicleLabel entsteht hier wie in
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
    expect(body).toContain(`${INTRO_DE} BMW Älteres Modell.`);
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("mit vehicleText: Marke + vehicleText, der nichtssagende Platzhaltername bleibt weg (kein doppeltes Lesen, Kundenrückmeldung)", () => {
    const { subject, body } = buildDraft(kurzablaufCtx("320i Touring, Baujahr ca. 2011"), "de");
    expect(subject).toBe("Ihre Anfrage für den BMW 320i Touring, Baujahr ca. 2011, Nr. 2026-0099");
    expect(body).toContain(`${INTRO_DE} BMW 320i Touring, Baujahr ca. 2011.`);
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
    expect(bodyWithout).toContain("Motor\n- Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe), ab CHF 4'180");
    expect(bodyWith).toContain("Motor\n- Stufe 1 mit V/max-Aufhebung (640 PS / 770 Nm, M6 & A8-Getriebe), ab CHF 4'980");
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
      "Motor\n- Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung, ab CHF 2'230",
    );
    expect(body).not.toContain("Leistungssteigerung mit V/max-Aufhebung");
  });
});

describe("buildDraft: Positionszeile mit mehrzeiliger Beschreibung (Befund #2 der Anfrage-Prüfung)", () => {
  it("Radsatz-Beschreibung ohne Zeilenumbruch in der Positionszeile, kein Doppelpunkt vor der Klammer", () => {
    const ctx = { ...m2Ctx(), items: [RADSATZ], estimatedTotal: 7100 };
    const { body } = buildDraft(ctx, "de");
    // Rückmeldung dÄHLer 28.10.2026: Achsen als eingerückte Unterzeilen, kein «bestehend aus».
    expect(body).toContain(
      "Räder\n- CDC1 FORGED Radsatz geschmiedet, ab CHF 7'100\n  10 × 20 Zoll mit Bereifung 275/30 R20\n  10 × 20 Zoll mit Bereifung 285/30 R20",
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
    expect(body).toContain(`${INTRO_DE} BMW M2 (G87), Jahrgang 2025.`);
    expect(body).not.toContain("undefined");
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("timing null: derselbe Terminsatz wie bei jedem Zeitraum (Wunsch dÄHLer 14.10.2026)", () => {
    const ctx = { ...m2Ctx(), timing: null };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain(TIMING_DE);
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

// --- Rückmeldung dÄHLer 14.10.2026 ---------------------------------------
describe("buildDraft: Bereich ohne gewähltes Produkt (Anfrage 2026-0016)", () => {
  it("gewählte Kategorie ohne Produkt erscheint mit Beratungszeile, kein «Grundsätzlich»", () => {
    const ctx = { ...m2Ctx(), categories: ["motor", "auspuff", "fahrwerk", "raeder"] as DraftContext["categories"], items: [RADSATZ], estimatedTotal: 7100 };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain("Motor\n- Gerne beraten wir Sie persönlich zur passenden Lösung.");
    expect(body).toContain("Auspuff\n- Gerne beraten wir Sie persönlich zur passenden Lösung.");
    expect(body).toContain("Fahrwerk\n- Gerne beraten wir Sie persönlich zur passenden Lösung.");
    expect(body).toContain("Räder\n- CDC1 FORGED");
    expect(body).not.toMatch(/grundsätzlich/i);
    assertClean(body, SETTINGS.signaturePhone);
  });
});

describe("buildDraft: Mailtexte aus dem Admin (lib/mail/texts.ts)", () => {
  it("ersetzt Einleitung, Terminsatz und Schluss, Platzhalter werden gefüllt", () => {
    const ctx = {
      ...m2Ctx(),
      settings: {
        ...SETTINGS,
        texts: {
          text_draft_intro: "Grüezi {{vorname}} {{name}}\n\nMerci für die Anfrage zu Ihrem {{fahrzeug}}{{jahrgang}} (Nr. {{nummer}}).",
          text_draft_timing: "",
          text_draft_closing: "Bis bald\n\nHerzliche Grüsse",
        },
      },
    };
    const { body } = buildDraft(ctx, "de");
    expect(body.startsWith("Grüezi Max Muster\n\nMerci für die Anfrage zu Ihrem BMW M2 (G87), Jahrgang 2025 (Nr. 2026-0012).")).toBe(true);
    // Leeres Feld = Standardtext.
    expect(body).toContain(TIMING_DE);
    expect(body).toContain("Bis bald\n\nHerzliche Grüsse\nChristoph Dähler");
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("unbekannter Platzhalter wird geleert, nie roh an den Kunden", () => {
    const ctx = { ...m2Ctx(), settings: { ...SETTINGS, texts: { text_draft_intro: "Guten Tag {{anrede}} {{name}} {{tippfehler}}" } } };
    const { body } = buildDraft(ctx, "de");
    expect(body.startsWith("Guten Tag Max Muster Muster")).toBe(true);
    expect(body).not.toContain("{{");
  });

  it("englischer Entwurf nutzt die englischen Admin-Texte (Schlüssel «_en»), nie die deutschen", () => {
    const ctx = {
      ...m2Ctx(),
      settings: { ...SETTINGS, texts: { text_draft_intro: "Grüezi", text_draft_intro_en: "Hello {{vorname}}, thanks for asking about your {{fahrzeug}}." } },
    };
    expect(buildDraft(ctx, "en").body.startsWith("Hello Max, thanks for asking about your BMW M2 (G87).")).toBe(true);
    expect(buildDraft(ctx, "de").body.startsWith("Grüezi")).toBe(true);
    const onlyGerman = { ...m2Ctx(), settings: { ...SETTINGS, texts: { text_draft_intro: "Grüezi" } } };
    expect(buildDraft(onlyGerman, "en").body.startsWith("Dear Max Muster")).toBe(true);
  });
});

// --- Rückmeldung dÄHLer 19.10.2026: {{schwerpunkt}} aus Bereichen und Folgefragen
describe("buildDraft: Charaktersatz mit Schwerpunkt", () => {
  it("Auspuff «Kräftig», sportlich: wie in Christophs Beispielmail", () => {
    const ctx = { ...m2Ctx(), categories: ["auspuff"] as DraftContext["categories"], followUpAnswers: { auspuff: "kraeftig" }, items: [KOMPLETTANLAGE], estimatedTotal: 5260 };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain(
      `${MODEL_DE} Eine kräftige Klangkulisse, sportlich und präzise abgestimmt, genau hier setzen wir bei dÄHLer an.\n\n${ITEMS_INTRO_DE}`,
    );
  });

  it("nur Komplettpaket ohne Bereiche: neutrale Wendung", () => {
    const ctx = { ...m2Ctx(), categories: [] as DraftContext["categories"], consulting: true, items: [], estimatedTotal: null };
    expect(buildDraft(ctx, "de").body).toContain("Ein stimmiges Gesamtpaket, sportlich und präzise abgestimmt");
  });
});

describe("buildDraft: Schwerpunkt-Wendungen aus dem Admin", () => {
  it("eigene Wendung ersetzt die Standardwendung, leeres Feld bleibt Standard", () => {
    const ctx = {
      ...m2Ctx(),
      categories: ["motor", "auspuff"] as DraftContext["categories"],
      followUpAnswers: { auspuff: "kraeftig" },
      settings: { ...SETTINGS, texts: { text_emph_motor: "deutlich mehr Druck", text_emph_auspuff_kraeftig: "" } },
    };
    expect(buildDraft(ctx, "de").body).toContain("Deutlich mehr Druck und eine kräftige Klangkulisse, sportlich und präzise abgestimmt");
  });
});

// --- Rückmeldung dÄHLer 28.10.2026: Anrede, {{modell}}, Empfehlungsform, Achszeilen
const CDC2: DraftItem = {
  category: "raeder",
  name: "CDC2 FORGED Schmiederadsatz bestehend aus:",
  description: '9 x 20" mit 255/30 20 VA\n10 x 20" mit 275/30 20 HA',
  priceTotal: 7300,
  priceStatus: "priced",
  psTo: null,
  nmTo: null,
  variantGroup: null,
};

function raederCtx(overrides: Partial<DraftContext> = {}): DraftContext {
  return { ...m2Ctx(), categories: ["raeder"], items: [CDC2], estimatedTotal: 7300, ...overrides };
}

describe("buildDraft: Anrede und {{modell}}", () => {
  it("mit Anrede Herr: «Guten Tag Herr Muster»", () => {
    const { body } = buildDraft(raederCtx({ salutation: "herr" }), "de");
    expect(body.startsWith("Guten Tag Herr Muster\n\n")).toBe(true);
    expect(buildDraft(raederCtx({ salutation: "frau" }), "de").body.startsWith("Guten Tag Frau Muster\n\n")).toBe(true);
    expect(buildDraft(raederCtx({ salutation: "herr" }), "en").body.startsWith("Dear Mr Muster\n\n")).toBe(true);
    expect(buildDraft(raederCtx({ salutation: "frau" }), "en").body.startsWith("Dear Ms Muster\n\n")).toBe(true);
  });

  it("ohne Anrede: «Vorname Name» wie bisher, nie aus dem Vornamen abgeleitet", () => {
    expect(buildDraft(raederCtx(), "de").body.startsWith("Guten Tag Max Muster\n\n")).toBe(true);
    expect(buildDraft(raederCtx({ salutation: null }), "de").body.startsWith("Guten Tag Max Muster\n\n")).toBe(true);
  });

  it("{{modell}} ohne Baureihencode, {{fahrzeug}} unverändert", () => {
    const { body } = buildDraft(raederCtx(), "de");
    expect(body).toContain("Ihren BMW M2 (G87), Jahrgang 2025.");
    expect(body).toContain("Der BMW M2 verbindet");
    expect(body).toContain("Für Ihren BMW M2 bieten wir");
    expect(body).not.toContain("BMW M2 (G87) verbindet");
  });
});

describe("buildDraft: genau eine Position, Empfehlungsform mit Achszeilen", () => {
  it("de: Empfehlung, Achszeilen, Preiszeile, keine Gesamtpaket-Zeile, Fahrwerk-Rückfrage bei Rädern", () => {
    const { body } = buildDraft(raederCtx(), "de");
    expect(body).toContain(
      [
        "Unsere Empfehlung: CDC2 FORGED Schmiederadsatz",
        "Vorderachse: 9 × 20 Zoll mit Bereifung 255/30 R20",
        "Hinterachse: 10 × 20 Zoll mit Bereifung 275/30 R20",
        "Preis: ab CHF 7'300, inklusive Montage, exklusive MFK",
      ].join("\n"),
    );
    expect(body).not.toContain("Richtpreis für das Gesamtpaket");
    expect(body).not.toContain("bestehend aus");
    expect(body).toContain(`\n\n${QUESTION_FAHRWERK_DE}\n\n${TIMING_DE}`);
    assertClean(body, SETTINGS.signaturePhone);
  });

  it("en: Front axle / Rear axle", () => {
    const { body } = buildDraft(raederCtx(), "en");
    expect(body).toContain(
      [
        "Our recommendation: CDC2 FORGED Schmiederadsatz",
        "Front axle: 9 × 20 inch with 255/30 R20 tyres",
        "Rear axle: 10 × 20 inch with 275/30 R20 tyres",
        "Price: from CHF 7'300, including fitting, excluding roadworthiness test",
      ].join("\n"),
    );
  });

  it("Freiform der Excel bleibt wörtlich, nichts ergänzt", () => {
    const item = { ...CDC2, description: "11 x 23 mit VA 285/ 35 23, HA 325/30 23 in Wunschfarbe lackiert" };
    const { body } = buildDraft(raederCtx({ items: [item] }), "de");
    expect(body).toContain(
      "Unsere Empfehlung: CDC2 FORGED Schmiederadsatz\n11 x 23 mit VA 285/ 35 23, HA 325/30 23 in Wunschfarbe lackiert\nPreis: ab CHF 7'300",
    );
  });

  it("auf Anfrage und in Vorbereitung: Preiszeile ohne Betrag", () => {
    const onRequest = buildDraft(raederCtx({ items: [{ ...CDC2, priceTotal: null, priceStatus: "on_request" }], estimatedTotal: null }), "de").body;
    expect(onRequest).toContain("\nPreis: auf Anfrage\n");
    const prep = buildDraft(raederCtx({ items: [{ ...CDC2, priceTotal: null, priceStatus: "in_preparation" }], estimatedTotal: null }), "de").body;
    expect(prep).toContain("\nPreis: in Vorbereitung\n");
  });

  it("Stufe 1 allein: Empfehlung mit Leistungssatz, allgemeine Rückfrage", () => {
    const ctx = { ...m2Ctx(), categories: ["motor"] as DraftContext["categories"], items: [STUFE_1], estimatedTotal: 4180 };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain("Unsere Empfehlung: Stufe 1 (620 PS / 740 Nm, M6 & A8-Getriebe)\nPreis: ab CHF 4'180, inklusive Montage, exklusive MFK");
    expect(body).toContain(QUESTION_GENERIC_DE);
  });

  it("Kategorie ohne Produkt oder Komplettpaket: keine Empfehlungsform", () => {
    const withGap = buildDraft(raederCtx({ categories: ["raeder", "motor"] }), "de").body;
    expect(withGap).not.toContain("Unsere Empfehlung");
    expect(withGap).toContain("Richtpreis für das Gesamtpaket: ab CHF 7'300");
    const consulting = buildDraft(raederCtx({ consulting: true }), "de").body;
    expect(consulting).not.toContain("Unsere Empfehlung");
  });
});

describe("buildDraft: Rückfrage nach Auswahl", () => {
  it("Motor und Auspuff ohne Fahrwerk/Räder: Kombination prüfen", () => {
    const ctx = { ...m2Ctx(), categories: ["motor", "auspuff"] as DraftContext["categories"], items: [STUFE_1, KOMPLETTANLAGE], estimatedTotal: 9440 };
    const { body } = buildDraft(ctx, "de");
    expect(body).toContain("prüfen wir die gewünschte Kombination aus Software-Leistungssteigerung und Abgasanlage");
    expect(body).not.toContain("adaptiven M-Fahrwerk");
  });
});
