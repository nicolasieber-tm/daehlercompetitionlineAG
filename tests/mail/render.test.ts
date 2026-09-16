// lib/mail/render.ts: vehicleLabel() (Prüfung Phase B, Punkt 1, blocker) und
// itemList() (Punkt 2, mehrzeilige Beschreibung mit <br>/Einrückung).
import { describe, expect, it } from "vitest";
import { itemList, vehicleLabel } from "@/lib/mail/render";
import type { MailInquiryItem } from "@/lib/mail/types";
import type { Model, ModelFamily } from "@/lib/db/rows";

function family(overrides: Partial<ModelFamily> & { brand: string; name: string }): ModelFamily {
  return {
    active: true,
    codes: [],
    created_at: "2026-01-01T00:00:00.000Z",
    has_pricelist: true,
    id: "family-1",
    photo_url: null,
    pricelist_no: null,
    short_text: null,
    slug: "slug",
    sort: 0,
    source_file: null,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function model(overrides: Partial<Model> & { name: string }): Model {
  return {
    active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    family_id: "family-1",
    fuel: "benzin",
    id: "model-1",
    photo_url: null,
    series_nm: null,
    series_ps: null,
    series_ps_suggested: [],
    slug: "slug",
    sort: 0,
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("vehicleLabel: Formel aus docs/architektur.md, Abschnitt 'Fahrzeugbezeichnung' (Kundenrückmeldung 'BMW M2 G87, M2 liest sich doppelt')", () => {
  it('BMW 3er M40i (G20, G21): Codes in Klammern, nicht in der Linie', () => {
    const f = family({ brand: "BMW", name: "3er G20, G21", codes: ["G20", "G21"] });
    const m = model({ name: "M40i" });
    expect(vehicleLabel({ family: f, model: m, vehicleText: null })).toBe("BMW 3er M40i (G20, G21)");
  });

  it('BMW M2 (G87): Linie und Modellname zu einem Satz verschmolzen statt komma-getrennt', () => {
    const f = family({ brand: "BMW", name: "M2 G87", codes: ["G87"] });
    const m = model({ name: "M2" });
    expect(vehicleLabel({ family: f, model: m, vehicleText: null })).toBe("BMW M2 (G87)");
  });

  it('MINI Countryman Cooper S (F60): Marke nicht doppeln, wenn family.name sie schon enthält', () => {
    const f = family({ brand: "MINI", name: "MINI F60 Countryman", codes: ["F60"] });
    const m = model({ name: "Cooper S" });
    expect(vehicleLabel({ family: f, model: m, vehicleText: null })).toBe("MINI Countryman Cooper S (F60)");
  });

  it("Wiesmann: kein Modell, family.name = family.brand -> keine Dublette", () => {
    const f = family({ brand: "Wiesmann", name: "Wiesmann", has_pricelist: false });
    expect(vehicleLabel({ family: f, model: null, vehicleText: null })).toBe("Wiesmann");
  });

  it("Platzhalterfamilie ohne Modell: Familienzeile allein; MIT vehicleText ersetzt vehicleText die Linie ganz (Marke + vehicleText, kein Doppel-Lesen mehr)", () => {
    const f = family({ brand: "BMW", name: "Älteres Modell", has_pricelist: false });
    expect(vehicleLabel({ family: f, model: null, vehicleText: null })).toBe("BMW Älteres Modell");
    // Ohne Modell im Katalog (has_pricelist false) ist vehicleText der
    // einzige Weg, die konkrete Modellbezeichnung zu zeigen - die
    // Platzhalter-Familienzeile selbst wird dann NICHT mehr zusätzlich
    // gezeigt (Regel 4, docs/architektur.md): "BMW Älteres Modell, 320i
    // Touring" liest sich genauso doppelt/unnötig wie der ursprüngliche
    // Kundenbefund.
    expect(vehicleLabel({ family: f, model: null, vehicleText: "320i Touring, Baujahr ca. 2011" })).toBe(
      "BMW 320i Touring, Baujahr ca. 2011",
    );
  });

  it("ohne Familie: vehicle_text als Fallback, sonst leerer String", () => {
    expect(vehicleLabel({ family: null, model: null, vehicleText: "320i Touring, Baujahr ca. 2011" })).toBe(
      "320i Touring, Baujahr ca. 2011",
    );
    expect(vehicleLabel({ family: null, model: null, vehicleText: null })).toBe("");
    expect(vehicleLabel({ family: null, model: null, vehicleText: "  " })).toBe("");
  });

  it("TOYOTA-Familienname: Marke nicht doppeln, Markenschreibweise aus brand (TOYOTA -> Toyota)", () => {
    const f = family({ brand: "Toyota", name: "TOYOTA GR Supra", codes: [] });
    expect(vehicleLabel({ family: f, model: null, vehicleText: null })).toBe("Toyota GR Supra");
  });
});

describe("itemList: mehrzeilige Beschreibung (Prüfung Phase B, Punkt 2)", () => {
  const radsatz: MailInquiryItem = {
    category: "raeder",
    name: "CDC1 FORGED Radsatz geschmiedet bestehend aus:",
    description: '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20',
    price_total: 7100,
    price_status: "priced",
  };

  it('HTML: die Beschreibungszeilen sind mit <br> getrennt, nicht zu einer Zeile zusammengefasst', () => {
    const { html } = itemList([radsatz], "de");
    // escapeHtml wandelt das Zoll-Zeichen (") in &quot; um.
    expect(html).toContain("10 x 20&quot; mit 275/30 20<br>10 x 20&quot; mit 285/30 20");
    expect(html).not.toContain("275/30 20, 10 x 20"); // keine Komma-Zusammenfassung mehr
  });

  it("Text: die Beschreibungszeilen sind eingerückt auf eigenen Zeilen, nicht komma-getrennt", () => {
    const { text } = itemList([radsatz], "de");
    const lines = text.split("\n");
    const headIdx = lines.findIndex((l) => l.includes("CDC1 FORGED Radsatz"));
    expect(headIdx).toBeGreaterThanOrEqual(0);
    expect(lines[headIdx + 1]).toBe('    10 x 20" mit 275/30 20');
    expect(lines[headIdx + 2]).toBe('    10 x 20" mit 285/30 20');
  });

  it("einzeilige Beschreibung bleibt wie bisher in Klammern auf derselben Zeile", () => {
    const item: MailInquiryItem = {
      category: "motor",
      name: "Stufe 1",
      description: "620 PS / 740 Nm",
      price_total: 4180,
      price_status: "priced",
    };
    const { text, html } = itemList([item], "de");
    expect(text).toContain("Motor: Stufe 1 (620 PS / 740 Nm), ab CHF 4'180");
    expect(html).toContain("Motor: Stufe 1 (620 PS / 740 Nm)");
    expect(html).not.toContain("<br>");
  });
});
