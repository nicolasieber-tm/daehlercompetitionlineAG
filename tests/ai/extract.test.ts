// Posten 3, Schnellweg: extractInquiry() gegen einen gemockten
// Anthropic-Client (vi.mock("@anthropic-ai/sdk")) und einen gemockten
// Katalog (vi.mock("@/lib/catalog/queries") - getCatalogCompact()/
// getFamilyBySlug() brauchen sonst next/headers bzw. eine laufende
// Postgres-Verbindung). Deckt: die Katalog-Kompaktierung schickt Slugs/IDs
// mit, die Validierung setzt ungültige Produkt-IDs bzw. Familie/Modell-
// Slugs auf null und meldet sie in open_questions, Produkte fremder
// Familien werden abgelehnt (Prüfbericht Befund #2), ein zu grosser Katalog
// ohne eingrenzbare Familie schickt keine Produkte mehr (Befund #3), und
// toInquiryPayload() validiert gegen QuickInquiryPayloadSchema, das für den
// Schnellweg nur "Telefon ODER E-Mail" statt beides verlangt und Ort
// offenlässt (Prüfbericht Modul ai, Befund #1).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompactFamily } from "@/lib/catalog/queries";

process.env.ANTHROPIC_API_KEY ??= "test-key-nicht-echt";

const MOCK_CATALOG: CompactFamily[] = [
  {
    slug: "m2-g87",
    name: "M2 G87",
    brand: "BMW",
    models: [
      { slug: "m2", name: "M2" },
      { slug: "m2-cs", name: "M2 CS" },
    ],
    products: [
      { id: "prod-stufe-1", name: "Stufe 1: (Basis 460 PS) 590PS / 720Nm", category: "motor", priceTotal: 4180 },
      { id: "prod-komplettanlage", name: "Komplettanlage HP", category: "auspuff", priceTotal: 5260 },
    ],
  },
  {
    slug: "3er-g20-g21",
    name: "3er G20, G21",
    brand: "BMW",
    models: [{ slug: "20i", name: "20i" }],
    products: [{ id: "prod-sportfeder", name: "Sportfedersatz -25mm", category: "fahrwerk", priceTotal: 1490 }],
  },
];

// Für lib/ai/to-payload.ts getFamilyBySlug(): family_id/model_id-Auflösung,
// nur die für die Tests benötigten Felder realistisch befüllt (Form wie
// lib/catalog/queries.ts CatalogFamily).
const MOCK_FAMILIES_BY_SLUG: Record<string, unknown> = {
  "m2-g87": {
    id: "11111111-1111-4111-8111-111111111111",
    brand: "BMW",
    name: "M2 G87",
    slug: "m2-g87",
    codes: ["G87"],
    hasPricelist: true,
    photoUrl: null,
    shortText: null,
    sort: 0,
    models: [
      { id: "11111111-1111-4111-8111-111111111112", name: "M2", slug: "m2", fuel: "benzin", seriesPs: 460, seriesNm: 550, seriesPsSuggested: [], sort: 0 },
      { id: "11111111-1111-4111-8111-111111111113", name: "M2 CS", slug: "m2-cs", fuel: "benzin", seriesPs: 530, seriesNm: 650, seriesPsSuggested: [], sort: 1 },
    ],
  },
  "3er-g20-g21": {
    id: "22222222-2222-4222-8222-222222222222",
    brand: "BMW",
    name: "3er G20, G21",
    slug: "3er-g20-g21",
    codes: ["G20", "G21"],
    hasPricelist: true,
    photoUrl: null,
    shortText: null,
    sort: 1,
    models: [
      { id: "22222222-2222-4222-8222-222222222223", name: "20i", slug: "20i", fuel: "benzin", seriesPs: 184, seriesNm: 300, seriesPsSuggested: [], sort: 0 },
    ],
  },
};

vi.mock("@/lib/catalog/queries", () => ({
  getCatalogCompact: vi.fn(async () => MOCK_CATALOG),
  getFamilyBySlug: vi.fn(async (slug: string) => MOCK_FAMILIES_BY_SLUG[slug] ?? null),
}));

const createMock = vi.fn();
const countTokensMock = vi.fn(async () => ({ input_tokens: 800 }));

vi.mock("@anthropic-ai/sdk", () => ({
  // Regulärer function-Ausdruck statt Arrow-Funktion: lib/ai/client.ts ruft
  // `new Anthropic(...)` auf, eine Arrow-Funktion kann nicht als Konstruktor
  // verwendet werden (siehe tests/mail/resend.test.ts, gleiches Muster).
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { create: createMock, countTokens: countTokensMock } };
  }),
}));

import { extractInquiry } from "@/lib/ai/extract";
import { toInquiryPayload } from "@/lib/ai/to-payload";
import type { Extraction } from "@/lib/ai/extract";

function toolUseResponse(input: unknown) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "toolu_1", name: "record_inquiry", input }],
    usage: { input_tokens: 800, output_tokens: 150 },
  };
}

const VALID_AND_INVALID_INPUT = {
  vehicle: { family_slug: "m2-g87", model_slug: "does-not-exist", free_text: "M2 G87", confidence: 0.85 },
  year: "2024",
  categories: ["motor", "auspuff"],
  selections: [
    { product_id: "prod-stufe-1", name_as_written: "Stufe 1", confidence: 0.9 },
    { product_id: "prod-999-unbekannt", name_as_written: "Turbolader XYZ", confidence: 0.4 },
  ],
  consulting: false,
  character: "sportlich",
  timing: "m3_6",
  contact: {
    first_name: "Max",
    last_name: "Muster",
    city: null,
    phone: "079 123 45 67",
    email: "max@example.ch",
    channel: "email",
  },
  message: "Möchte Stufe 1 und eine Klappenauspuffanlage.",
  open_questions: [],
  language: "de",
};

beforeEach(() => {
  createMock.mockReset();
  countTokensMock.mockReset();
  countTokensMock.mockResolvedValue({ input_tokens: 800 });
});

describe("extractInquiry", () => {
  it("setzt eine ungültige Produkt-ID und einen ungültigen Modell-Slug auf null und meldet sie in open_questions", async () => {
    createMock.mockResolvedValueOnce(toolUseResponse(VALID_AND_INVALID_INPUT));

    const extraction = await extractInquiry("Guten Tag, ich habe einen M2 G87 ...");

    expect(extraction.vehicle.family_slug).toBe("m2-g87"); // gültig, bleibt erhalten
    expect(extraction.vehicle.model_slug).toBeNull(); // ungültig -> null
    expect(extraction.open_questions.some((q) => q.includes("does-not-exist"))).toBe(true);

    expect(extraction.selections[0].product_id).toBe("prod-stufe-1"); // gültig, bleibt erhalten
    expect(extraction.selections[1].product_id).toBeNull(); // ungültig -> null
    expect(extraction.open_questions.some((q) => q.includes("prod-999-unbekannt"))).toBe(true);

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("lehnt ein Produkt einer anderen Familie ab, auch wenn die ID im Gesamtkatalog existiert (Befund #2)", async () => {
    // prod-sportfeder gehört zur Familie 3er-g20-g21, erkannt wurde aber
    // m2-g87: vor der Korrektur landete das Produkt trotzdem gültig in der
    // Extraction, weil die Produkt-ID-Prüfung über den GESAMTEN Katalog
    // lief statt nur über die erkannte Familie.
    const input = {
      ...VALID_AND_INVALID_INPUT,
      vehicle: { family_slug: "m2-g87", model_slug: "m2", free_text: "M2 G87", line: null, confidence: 0.9 },
      selections: [
        { product_id: "prod-stufe-1", name_as_written: "Stufe 1", confidence: 0.9 },
        { product_id: "prod-sportfeder", name_as_written: "Sportfedersatz", confidence: 0.8 },
      ],
    };
    createMock.mockResolvedValueOnce(toolUseResponse(input));

    const extraction = await extractInquiry("M2 G87 mit Stufe 1 und Sportfedern");

    expect(extraction.selections[0].product_id).toBe("prod-stufe-1"); // eigene Familie, bleibt erhalten
    expect(extraction.selections[1].product_id).toBeNull(); // fremde Familie -> null
    expect(extraction.open_questions.some((q) => q.includes("prod-sportfeder") && q.includes("m2-g87"))).toBe(true);
  });

  it("berechnet uncertain aus allen Feldern mit confidence < 0.7", async () => {
    createMock.mockResolvedValueOnce(toolUseResponse(VALID_AND_INVALID_INPUT));

    const extraction = await extractInquiry("Text ...");

    expect(extraction.uncertain).toContain("selections[1]"); // confidence 0.4
    expect(extraction.uncertain).not.toContain("vehicle"); // confidence 0.85
    expect(extraction.uncertain).not.toContain("selections[0]"); // confidence 0.9
  });

  it("schickt die Katalog-Kompaktierung mit Familien-/Modell-Slugs und Produkt-IDs mit", async () => {
    createMock.mockResolvedValueOnce(toolUseResponse(VALID_AND_INVALID_INPUT));

    await extractInquiry("Anfrage für einen M2 G87");

    expect(createMock).toHaveBeenCalledTimes(1);
    const params = createMock.mock.calls[0][0] as { messages: { content: string }[] };
    const userMessage = params.messages[0].content;

    // Familien-/Modell-Slugs (lib/catalog/queries.ts CompactFamily/CompactModel)
    expect(userMessage).toContain("m2-g87");
    expect(userMessage).toContain("m2=M2");
    expect(userMessage).toContain("3er-g20-g21");
    // Produkt-IDs (lib/catalog/queries.ts CompactProduct)
    expect(userMessage).toContain("prod-stufe-1");
    expect(userMessage).toContain("prod-sportfeder");
  });

  it("zählt die Katalog-Token (client.messages.countTokens) und meldet sie (console.info)", async () => {
    createMock.mockResolvedValueOnce(toolUseResponse(VALID_AND_INVALID_INPUT));
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await extractInquiry("Anfrage ...");

    expect(countTokensMock).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("catalogTokens=800"));
    infoSpy.mockRestore();
  });

  it("grenzt bei zu grossem Katalog zuerst per pick_family auf eine Familie ein", async () => {
    // Erster countTokens-Aufruf (kompletter Katalog): über dem Budget.
    // Zweiter (nach Eingrenzung): darunter.
    countTokensMock.mockResolvedValueOnce({ input_tokens: 90000 }).mockResolvedValueOnce({ input_tokens: 1200 });

    createMock
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "toolu_pick", name: "pick_family", input: { family_slug: "m2-g87", confidence: 0.8 } }],
        usage: { input_tokens: 500, output_tokens: 20 },
      })
      .mockResolvedValueOnce(toolUseResponse(VALID_AND_INVALID_INPUT));
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await extractInquiry("Anfrage für einen M2 G87 ...");

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("narrowedToFamily=m2-g87"));

    // Die zweite (eingegrenzte) Nachricht enthält nur noch die Produkte der
    // gewählten Familie, nicht mehr die der anderen Familie.
    const secondParams = createMock.mock.calls[1][0] as { messages: { content: string }[] };
    const narrowedMessage = secondParams.messages[0].content;
    expect(narrowedMessage).toContain("prod-stufe-1");
    expect(narrowedMessage).not.toContain("prod-sportfeder");
    infoSpy.mockRestore();
  });

  it("schickt bei zu grossem Katalog OHNE eingrenzbare Familie keine Produkte mehr mit (Befund #3)", async () => {
    // pick_family liefert keine (bzw. keine gültige) Familie: vor der
    // Korrektur fiel productsText(catalog, null) dann auf den KOMPLETTEN
    // Katalog zurück (alle Familien, alle Produkte) - das Budget war damit
    // wirkungslos, genau im unklaren Fall wurde der grösste Aufruf gemacht.
    countTokensMock.mockResolvedValueOnce({ input_tokens: 90000 }).mockResolvedValueOnce({ input_tokens: 500 });

    createMock
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "toolu_pick", name: "pick_family", input: { family_slug: null, confidence: 0.2 } }],
        usage: { input_tokens: 500, output_tokens: 20 },
      })
      .mockResolvedValueOnce(
        toolUseResponse({
          ...VALID_AND_INVALID_INPUT,
          vehicle: { family_slug: null, model_slug: null, free_text: "irgendein BMW", confidence: 0.3 },
          selections: [],
        }),
      );
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const extraction = await extractInquiry("Mehrdeutiger Text ohne klares Modell ...");

    expect(createMock).toHaveBeenCalledTimes(2);
    const secondParams = createMock.mock.calls[1][0] as { messages: { content: string }[] };
    const narrowedMessage = secondParams.messages[0].content;
    // Familienindex (Übersicht) bleibt, aber KEINE Produkt-IDs mehr - weder
    // der einen noch der anderen Familie.
    expect(narrowedMessage).toContain("m2-g87");
    expect(narrowedMessage).toContain("3er-g20-g21");
    expect(narrowedMessage).not.toContain("prod-stufe-1");
    expect(narrowedMessage).not.toContain("prod-sportfeder");

    expect(extraction.open_questions.some((q) => q.includes("nicht sicher erkannt"))).toBe(true);
    infoSpy.mockRestore();
  });

  it("wirft bei leerem Text ohne einen Anthropic-Aufruf", async () => {
    await expect(extractInquiry("   ")).rejects.toThrow();
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("toInquiryPayload", () => {
  function baseExtraction(overrides?: Partial<Extraction>): Extraction {
    return {
      vehicle: { family_slug: null, model_slug: null, free_text: "", line: null, confidence: 0 },
      year: null,
      categories: [],
      selections: [],
      consulting: false,
      character: null,
      timing: null,
      contact: { first_name: null, last_name: null, city: null, phone: null, email: null, channel: null },
      message: "",
      open_questions: [],
      language: "de",
      uncertain: [],
      ...overrides,
    };
  }

  // Vollständige, gültige Extraction (inkl. Kontakt, Charakter, Termin) als
  // Basis für die "ok"-Fälle - QuickInquiryPayloadSchema (lib/ai/to-payload.ts)
  // verlangt deutlich mehr Pflichtfelder als der frühere Adapter (Name,
  // Charakter, Termin, Kanal, Familie, mindestens Telefon ODER E-Mail seit
  // Befund #1), siehe lib/ai/to-payload.ts Kommentar "derselbe Weg wie eine
  // Tool-Anfrage".
  function completeExtraction(overrides?: Partial<Extraction>): Extraction {
    return baseExtraction({
      vehicle: { family_slug: "m2-g87", model_slug: "m2", free_text: "M2 G87", line: null, confidence: 0.9 },
      year: "2024",
      categories: ["motor"],
      character: "sportlich",
      timing: "m3_6",
      contact: {
        first_name: "Anna",
        last_name: "Beispiel",
        city: "Belp",
        phone: "079 123 45 67",
        email: "anna@example.com",
        channel: "email",
      },
      ...overrides,
    });
  }

  it("meldet fehlende/ungültige Pflichtfelder (QuickInquiryPayloadSchema), wenn nichts erkannt wurde", async () => {
    const result = await toInquiryPayload(baseExtraction());

    expect(result.ok).toBe(false);
    expect(result.payload).toBeNull();
    expect(result.missing).toEqual(expect.arrayContaining(["familyId", "year", "firstName", "lastName", "channel"]));
    // Ort ist beim Schnellweg optional (Befund #1): ohne Angabe kein
    // eigener missing-Eintrag mehr. Die "Telefon oder E-Mail"-Sammelregel
    // (siehe Test unten) ist ein zod .refine() und läuft nur, wenn die
    // übrigen Felder bereits gültig sind - hier (alles leer) schlagen
    // familyId/year/... schon auf Objektebene fehl, daher fehlt "phone" in
    // diesem konkreten Fall; dedizierter Test unten mit sonst vollständigen
    // Daten und nur fehlendem Kontakt.
    expect(result.missing).not.toContain("city");
    // Prüfung Phase B, Punkt 7: character/timing sind im Schnellweg optional
    // (nullable), ein fehlender Wert ist also kein missing-Grund mehr
    // (anders als im Kundenflow, siehe eigener Test unten).
    expect(result.missing).not.toContain("character");
    expect(result.missing).not.toContain("timing");
  });

  it("ist ok mit Telefon ohne E-Mail (Telefonnotiz, Prüfbericht Modul ai Befund #1)", async () => {
    // CLAUDE.md "Posten 3, Schnellweg" nennt die Telefonnotiz explizit als
    // Eingabetyp; vor der Korrektur verlangte toInquiryPayload() zwingend
    // BEIDES (Telefon UND E-Mail), eine solche Notiz konnte nie zu einer
    // Anfrage werden.
    const extraction = completeExtraction({
      contact: { first_name: "Max", last_name: "Muster", city: null, phone: "031 555 22 11", email: null, channel: "phone" },
    });

    const result = await toInquiryPayload(extraction);

    expect(result.ok).toBe(true);
    expect(result.payload?.phone).toBe("031 555 22 11");
    // Prüfung Phase B, Punkt 7: leerer String -> null statt "" (lib/ai/to-payload.ts).
    expect(result.payload?.email).toBeNull();
    expect(result.payload?.city).toBeNull();
  });

  it("ist ok mit E-Mail ohne Telefon", async () => {
    const extraction = completeExtraction({
      contact: { first_name: "Anna", last_name: "Beispiel", city: null, phone: null, email: "anna@example.com", channel: "email" },
    });

    const result = await toInquiryPayload(extraction);

    expect(result.ok).toBe(true);
    expect(result.payload?.email).toBe("anna@example.com");
    expect(result.payload?.phone).toBeNull();
  });

  it("meldet 'phone' als fehlend, wenn weder Telefon noch E-Mail bekannt sind", async () => {
    const extraction = completeExtraction({
      contact: { first_name: "Max", last_name: "Muster", city: null, phone: null, email: null, channel: "phone" },
    });

    const result = await toInquiryPayload(extraction);

    expect(result.ok).toBe(false);
    expect(result.payload).toBeNull();
    expect(result.missing).toContain("phone");
  });

  it("lehnt eine unplausible E-Mail-Adresse weiterhin ab, auch ohne Telefon", async () => {
    const extraction = completeExtraction({
      contact: { first_name: "Max", last_name: "Muster", city: null, phone: null, email: "keine-email", channel: "email" },
    });

    const result = await toInquiryPayload(extraction);

    expect(result.ok).toBe(false);
    expect(result.payload).toBeNull();
    expect(result.missing).toContain("email");
  });

  it("löst family_slug/model_slug über getFamilyBySlug zu family_id/model_id auf und ist ok, wenn alles vorhanden ist", async () => {
    const result = await toInquiryPayload(completeExtraction());

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.payload?.familyId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.payload?.modelId).toBe("11111111-1111-4111-8111-111111111112");
    expect(result.payload?.firstName).toBe("Anna");
  });

  it("meldet familyId als fehlend/ungültig, wenn der family_slug im Katalog nicht auflösbar ist (Befund #2)", async () => {
    // Vor der Korrektur konnte ein nicht auflösbarer familySlug (z. B. ein
    // Tippfehler im Override) eine Anfrage GANZ OHNE Fahrzeug anlegen
    // (family_id/model_id/vehicle_text alle null), weil nur geprüft wurde,
    // ob der Slug-String überhaupt gesetzt war.
    const extraction = completeExtraction({
      vehicle: { family_slug: "gibt-es-nicht", model_slug: null, free_text: "unbekanntes Fahrzeug", line: null, confidence: 0.5 },
    });

    const result = await toInquiryPayload(extraction);

    expect(result.ok).toBe(false);
    expect(result.payload).toBeNull();
    expect(result.missing).toContain("familyId");
  });

  it("übernimmt gültige Produktauswahlen (product_id != null) in payload.selections und lässt ungültige weg", async () => {
    // toInquiryPayload() selbst prüft product_id nicht mehr gegen den
    // Katalog (das passiert bereits in extractInquiry()/validateExtraction,
    // siehe Befund #2), sondern nur gegen InquiryPayloadSchema
    // (selections[].productId muss eine UUID sein, wie beim Kundenflow) -
    // daher hier eine echte UUID statt der lesbaren MOCK_CATALOG-IDs.
    const extraction = completeExtraction({
      selections: [
        { product_id: "33333333-3333-4333-8333-333333333333", name_as_written: "Stufe 1", confidence: 0.9 },
        { product_id: null, name_as_written: "unbekanntes Produkt", confidence: 0.3 },
      ],
    });

    const result = await toInquiryPayload(extraction);

    expect(result.ok).toBe(true);
    expect(result.payload?.selections).toEqual([{ productId: "33333333-3333-4333-8333-333333333333" }]);
  });

  // Prüfung Phase B, Punkt 7: character/timing sind im Schnellweg optional
  // (das Sprachmodell liefert sie oft null, z. B. eine Telefonnotiz ohne
  // erkennbaren Zeitwunsch) - anders als im Kundenflow (dort Pflicht-Enum)
  // darf das allein nicht dazu führen, dass toInquiryPayload() scheitert.
  it("character/timing null bleiben null im Payload, sind kein missing-Grund", async () => {
    const extraction = completeExtraction({ character: null, timing: null });

    const result = await toInquiryPayload(extraction);

    expect(result.ok).toBe(true);
    expect(result.payload?.character).toBeNull();
    expect(result.payload?.timing).toBeNull();
    expect(result.missing).toEqual([]);
  });

  it("overrides überschreiben die aus der Extraction abgeleiteten Werte feldweise", async () => {
    const extraction = completeExtraction({
      contact: { first_name: "Anna", last_name: "Beispiel", city: "Belp", phone: "0791234567", email: null, channel: "phone" },
    });

    const result = await toInquiryPayload(extraction, { email: "korrigiert@example.com" });

    expect(result.ok).toBe(true);
    expect(result.payload?.email).toBe("korrigiert@example.com");
    expect(result.payload?.firstName).toBe("Anna"); // aus der Extraction, nicht überschrieben
  });
});
