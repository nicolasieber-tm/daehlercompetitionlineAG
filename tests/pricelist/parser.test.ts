import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parsePerformance, parseWorkbook } from "@/lib/pricelist/parser";
import { slug } from "@/lib/pricelist/slug";
import { variantGroupFor } from "@/lib/catalog/variant-groups";
import type { ParsedFamily } from "@/lib/pricelist/types";

const PRICELIST_DIR = join(process.cwd(), "docs/preislisten");

async function listPricelistFiles(): Promise<string[]> {
  const entries = await readdir(PRICELIST_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && /\.xlsx?$/i.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "de-CH"));
}

async function parseAll(): Promise<{ file: string; family: ParsedFamily }[]> {
  const files = await listPricelistFiles();
  const out: { file: string; family: ParsedFamily }[] = [];
  for (const file of files) {
    const buf = await readFile(join(PRICELIST_DIR, file));
    out.push({ file, family: parseWorkbook(buf, file) });
  }
  return out;
}

function withinTolerance(actual: number, expected: number, pct = 0.03): boolean {
  return Math.abs(actual - expected) <= expected * pct;
}

describe("parseWorkbook: alle 42 Dateien", () => {
  it("parst alle Dateien in docs/preislisten ohne Exception", async () => {
    const files = await listPricelistFiles();
    expect(files.length).toBe(42);

    const results: { file: string; family: ParsedFamily }[] = [];
    for (const file of files) {
      const buf = await readFile(join(PRICELIST_DIR, file));
      // Darf nicht werfen.
      const family = parseWorkbook(buf, file);
      results.push({ file, family });
    }
    expect(results.length).toBe(42);
    for (const { file, family } of results) {
      expect(family.slug, file).not.toBe("");
      expect(family.models.length, file).toBeGreaterThan(0);
      expect(family.products.length, file).toBeGreaterThan(0);
    }
  });

  it("erkennt 42 eindeutige Familien-Slugs (keine Kollisionen)", async () => {
    const parsed = await parseAll();
    const slugs = parsed.map((p) => p.family.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("Erwartete Kennzahlen (docs/excel-import.md)", () => {
  it("42 Familien, ca. 2'380 Produkte mit numerischem Total (priced), Toleranz +/-3%", async () => {
    const parsed = await parseAll();
    expect(parsed.length).toBe(42);

    const totalPriced = parsed.reduce(
      (sum, p) => sum + p.family.products.filter((x) => x.priceStatus === "priced").length,
      0,
    );
    expect(withinTolerance(totalPriced, 2380)).toBe(true);
  });

  // Hinweis zu den beiden folgenden Kennzahlen: Die Werte aus
  // docs/excel-import.md ("ca. 166 in_preparation", "87 ohne Marker") liessen
  // sich nicht reproduzieren, auch nicht mit +/-3% Toleranz. Eine direkte
  // Gegenkontrolle gegen die Rohdaten (jede Preiszelle mit "vorb"
  // ausserhalb der Fusszeile, bzw. jede Produktzeile ohne 'l'-Marker)
  // bestätigte ursprünglich 121 bzw. 93 als korrekt: "166" lässt sich fast
  // exakt erklären als 124 echte "in Vorb."-Zeilen plus 42 Fusszeilen ("...
  // Preisänderungen vorbehalten", eine pro Datei), die eine naive
  // Volltextsuche nach "vorb" mitzählt, aber nie ein Produkt sind.
  //
  // Nach den Parser-Korrekturen (Bericht, Prüfer-Befunde #1 und #7) sinken
  // beide Werte real und korrekt weiter: Befund #1 nimmt die Gutachten-/
  // Ergänzungsgarantie-Hinweiszeilen (RC A/N, Nummer 77/777, teils "in
  // Vorb." im Teilepreis) aus den Produkten heraus, das senkt
  // in_preparation. Befund #7 nimmt strukturierte, aber preislose Zeilen
  // ohne Fitment-Bezug (v. a. "Adaptersatz inkl. Radschrauben und
  // Nabenkappen", 123 von 182 Notes) aus den ehemaligen Pseudo-Notes/
  // Pseudo-Produkten heraus bzw. verwirft sie mit Warnung statt sie als
  // fitsAll-Produkt oder Hinweis zu zählen, das senkt "ohne Marker". Die
  // neuen Referenzwerte sind der aktuelle, geprüfte Parser-Output (siehe
  // `npm run parse`-Tabelle im Bericht).
  it("in_preparation: 117 Produkte (nach Korrektur Befund #1, Gegenkontrolle siehe Kommentar)", async () => {
    const parsed = await parseAll();
    const totalInPreparation = parsed.reduce(
      (sum, p) => sum + p.family.products.filter((x) => x.priceStatus === "in_preparation").length,
      0,
    );
    expect(withinTolerance(totalInPreparation, 117)).toBe(true);
  });

  // docs/excel-import.md nennt "ca. 70 ohne Marker" - dieser Wert ist nach
  // der Korrektur von Befund #1 (Bericht Runde 3) veraltet: die entfernte
  // "bestehend aus:"-Sonderregel hat bislang jede preislose Zeile nach einem
  // Radsatz (auch "Adaptersatz inkl. Radschrauben und Nabenkappen" ohne
  // Marker, z. B. MINI F60 Z45/46 "Edelstahlauspuffanlage"/"Komplettanlage")
  // still in dessen Beschreibung versteckt, statt sie als eigenständiges
  // Produkt zu zählen. Nach Regel 5b werden diese Zeilen korrekt als eigene
  // on_request-Produkte geführt; 17 davon haben selbst keine Marker (siehe
  // z. B. X3 G01/X4 G02 Z89, MINI F60 Z45/46, M3/M4 G80-83 Z158) und erhöhen
  // "ohne Marker" entsprechend von 71 auf 88 (71 + 17).
  //
  // Korrektur 14.09.2026 (Prüfung Phase B, Punkt 8b): 88 -> 85. Die
  // XM G09.xls-Zeile "Distanzscheiben (schwarz) Satz i.V. mit BMW Serien-
  // od. M Performance Räder" (marker- und preislos, einzige Preiszelle
  // "in Vorb.") zählte bis dahin fälschlich als eigenes (marker-loses)
  // Produkt statt als Gruppenzeile (siehe docs/excel-import.md, Regel 6,
  // Ergänzung 14.09.2026 Punkt 8b) - Wert per `npm run parse` erneut
  // gegengeprüft (Total-Zeile "o.Marker" 85).
  it('"ohne Marker" (fitsAll): 85 Produkte (nach Korrektur Befund #1 und Punkt 8b, siehe Kommentar)', async () => {
    const parsed = await parseAll();
    const totalNoMarker = parsed.reduce(
      (sum, p) => sum + p.family.products.filter((x) => x.fitsAll).length,
      0,
    );
    expect(withinTolerance(totalNoMarker, 85)).toBe(true);
  });

  it("10 Nur-Preise-Zeilen in den Rohdaten (Regel 4)", async () => {
    // Cross-Check direkt auf den Rohdaten (Regel 1+2+4 ohne den Rest der
    // Pipeline), unabhängig vom Parser, da ParsedFamily die Merges nicht
    // einzeln zählt.
    const files = await listPricelistFiles();
    let count = 0;
    for (const file of files) {
      const buf = await readFile(join(PRICELIST_DIR, file));
      const wb = XLSX.read(buf, { type: "buffer", raw: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: true,
        defval: null,
      }) as unknown[][];
      const row1 = rows[1] ?? [];
      const chfIdx: number[] = [];
      row1.forEach((v, i) => {
        if (typeof v === "string" && v.includes("CHF")) chfIdx.push(i);
      });
      const totCol = chfIdx[3];
      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row.some((v) => v !== null && v !== "")) continue;
        const totalRaw = row[totCol];
        const isFooter =
          typeof totalRaw === "string" &&
          row.every((v, idx) => idx === totCol || v === null || v === "");
        if (isFooter) continue;
        const nameB = row[1];
        const nameC = row[2];
        const hasName = (typeof nameB === "string" && nameB.trim() !== "") ||
          (typeof nameC === "string" && nameC.trim() !== "");
        if (hasName) continue;
        // Bewusst inkl. numerischem 0: docs/excel-import.md zählt "10"
        // Nur-Preise-Zeilen strukturell (Name leer, irgendeine Preiszelle
        // gefüllt). Eine davon (M3/M4 G80-83, Zeile 112) enthält nur eine
        // Total-Zelle mit Wert 0 statt eines echten Preises; der Parser
        // ignoriert reine 0-Werte als Dateneigenheit (siehe warnings) und
        // verändert dadurch das Zielprodukt nicht, das seinen echten Preis
        // bereits in der eigenen Zeile hat (kein Verlust an Information).
        const anyPrice = chfIdx.some((ci) => row[ci] !== null && row[ci] !== "");
        if (anyPrice) count++;
      }
    }
    expect(count).toBe(10);
  });
});

describe("M2 G87 (exakte Werte)", () => {
  async function loadM2G87(): Promise<ParsedFamily> {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M2 G87.xls"));
    return parseWorkbook(buf, "Produkteliste M2 G87.xls");
  }

  it("hat die Modelle M2 und M2 CS", async () => {
    const family = await loadM2G87();
    expect(family.models.map((m) => m.name)).toEqual(["M2", "M2 CS"]);
  });

  it("erstes Motorprodukt: Stufe 1 (Basis 460 PS) 590PS/720Nm, Total 4180, Fitment nur M2", async () => {
    const family = await loadM2G87();
    const product = family.products.find((p) => p.category === "motor" && p.psTo === 590);
    expect(product).toBeDefined();
    // Enthält im Original geschützte Leerzeichen (U+00A0) statt normaler
    // Leerzeichen ("Basis 460 PS"), deshalb Vergleich über Regex.
    expect(product?.name).toMatch(/^Stufe 1: \(Basis\s+460\s+PS\)/);
    expect(product?.psBase).toEqual([460]);
    expect(product?.nmTo).toBe(720);
    expect(product?.priceTotalChf).toBe(4180);
    expect(product?.priceStatus).toBe("priced");
    expect(product?.fits).toEqual(["M2"]);
    expect(product?.fitsAll).toBe(false);
  });

  it("Carbon Air Intake: Total 4320", async () => {
    const family = await loadM2G87();
    const product = family.products.find((p) => p.name === "Carbon Air Intake");
    expect(product?.priceTotalChf).toBe(4320);
  });

  it('CDC2 FORGED Radsatz (21"): Total 8980 mit Beschreibung aus den zwei Reifengrössen', async () => {
    const family = await loadM2G87();
    const product = family.products.find(
      (p) => p.name.startsWith("CDC2 FORGED Radsatz") && p.priceTotalChf === 8980,
    );
    expect(product).toBeDefined();
    expect(product?.description).toBe('9.5 x 21"  mit 275/25 21\n10.5 x 21" mit 295/25 21');
  });

  it("Spurstange HA einstellbar: in_preparation", async () => {
    const family = await loadM2G87();
    const product = family.products.find((p) => p.name.startsWith("Spurstange HA einstellbar"));
    expect(product?.priceStatus).toBe("in_preparation");
  });
});

describe("3er G20, G21 (exakte Werte)", () => {
  async function loadG20(): Promise<ParsedFamily> {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 3er G20, G21.xls"));
    return parseWorkbook(buf, "Produkteliste 3er G20, G21.xls");
  }

  it("hat 7 Modelle, 20i/30i/M40i benzin, Rest diesel", async () => {
    const family = await loadG20();
    expect(family.models.map((m) => m.name)).toEqual([
      "20i",
      "30i",
      "M40i",
      "18d",
      "20d",
      "30d",
      "M40d",
    ]);
    expect(family.models.map((m) => m.fuel)).toEqual([
      "benzin",
      "benzin",
      "benzin",
      "diesel",
      "diesel",
      "diesel",
      "diesel",
    ]);
  });

  it("Sportfedersatz -25mm 318i-320d fittet 20i, 30i, 18d, 20d, Total 1490", async () => {
    const family = await loadG20();
    const product = family.products.find((p) => p.name.startsWith("Sportfedersatz -25mm"));
    expect(product).toBeDefined();
    expect(product?.fits).toEqual(["20i", "30i", "18d", "20d"]);
    expect(product?.fitsAll).toBe(false);
    expect(product?.priceTotalChf).toBe(1490);
  });
});

describe("Nur-Preise-Zeile (Regel 4)", () => {
  it("ECU-Abdeckung in Carbon (M2 G87): Preis aus der Folgezeile, Total 320", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M2 G87.xls"));
    const family = parseWorkbook(buf, "Produkteliste M2 G87.xls");
    const product = family.products.find((p) => p.name === "ECU-Abdeckung in Carbon");
    expect(product).toBeDefined();
    expect(product?.priceTotalChf).toBe(320);
    expect(product?.priceStatus).toBe("priced");
  });
});

describe("Fortsetzung: Namen vs. Beschreibung (Regel 7)", () => {
  it('"...inkl." + Fortsetzung -> im Namen zusammengeführt (3er G20, G21)', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 3er G20, G21.xls"));
    const family = parseWorkbook(buf, "Produkteliste 3er G20, G21.xls");
    const product = family.products.find((p) => p.name.includes("DME/DDE Programmierung"));
    expect(product?.name).toBe(
      "Für viele Modelle ist auch eine DME/DDE Programmierung inkl. V/max. Aufhebung im Angebot",
    );
    expect(product?.description).toBeNull();
  });

  it("Radsatz-Reifengrössen -> in die Beschreibung, Zeilenumbruch-getrennt (M2 G87)", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M2 G87.xls"));
    const family = parseWorkbook(buf, "Produkteliste M2 G87.xls");
    const product = family.products.find(
      (p) => p.name.startsWith("CDC1 FORGED Radsatz") && p.priceTotalChf === 7100,
    );
    expect(product?.name.endsWith(":")).toBe(true);
    expect(product?.description).toContain("\n");
  });
});

describe("Hinweis-Erkennung (Regel 8)", () => {
  it("Ergänzungsgarantie (M2 G87) landet in notes, nicht in products", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M2 G87.xls"));
    const family = parseWorkbook(buf, "Produkteliste M2 G87.xls");
    const note = family.notes.find((n) => n.text.includes("Ergänzungsgarantie"));
    expect(note).toBeDefined();
    expect(note?.text).toContain("Garantieverlängerung");
    expect(note?.sourceCategory).toBe("Motor");

    const asProduct = family.products.find((p) => p.name.includes("Ergänzungsgarantie"));
    expect(asProduct).toBeUndefined();
  });
});

describe("Prüfer-Befund #1: Gutachten-/Garantie-Hinweise nie als Produkt", () => {
  it("kein Produktname beginnt mit \"Ein DTC\" oder \"Eine Ergänzungsgarantie\" (alle 42 Dateien)", async () => {
    const parsed = await parseAll();
    for (const { file, family } of parsed) {
      for (const p of family.products) {
        expect(p.name.startsWith("Ein DTC"), `${file} Zeile ${p.sourceRow}: "${p.name}"`).toBe(false);
        expect(p.name.startsWith("Eine Ergänzungsgarantie"), `${file} Zeile ${p.sourceRow}: "${p.name}"`).toBe(
          false,
        );
      }
    }
  });

  it('"DTC Gutachten zu Distanzscheiben" bleibt ein echtes, eigenes Produkt (Abgrenzung)', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 1er F20, F21.xls"));
    const family = parseWorkbook(buf, "Produkteliste 1er F20, F21.xls");
    const product = family.products.find((p) => p.name === "DTC Gutachten zu Distanzscheiben");
    expect(product).toBeDefined();
    expect(product?.priceTotalChf).toBe(90);
    expect(product?.priceStatus).toBe("priced");
  });

  it("1er F20, F21 Zeile 36: Gutachten-Hinweis landet in notes mit Preisangabe, nicht in products", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 1er F20, F21.xls"));
    const family = parseWorkbook(buf, "Produkteliste 1er F20, F21.xls");
    const note = family.notes.find((n) => n.text.startsWith("Ein DTC"));
    expect(note).toBeDefined();
    expect(note?.text).toContain("CHF 450");
  });
});

describe("Prüfer-Befund #2: content_hash-Dubletten innerhalb einer Familie", () => {
  it("kein family hat zwei Produkte mit identischem content_hash (alle 42 Dateien)", async () => {
    const parsed = await parseAll();
    for (const { file, family } of parsed) {
      const hashes = family.products.map((p) => p.contentHash);
      expect(new Set(hashes).size, file).toBe(hashes.length);
    }
  });

  it("M2 G87: die vier Adaptersatz-Zeilen bleiben vier eigenständige Produkte (unterschiedlicher Hash)", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M2 G87.xls"));
    const family = parseWorkbook(buf, "Produkteliste M2 G87.xls");
    const adapter = family.products.filter((p) => p.name === "Adaptersatz inkl. Radschrauben und Nabenkappen");
    expect(adapter.length).toBe(4);
    expect(new Set(adapter.map((p) => p.contentHash)).size).toBe(4);
  });
});

describe("Prüfer-Befund #3: MINI Endrohre-Paare, verschobener Total", () => {
  it("MINI F55, F56, F57: 2 Endrohre 80mm Total 980, 4 Endrohre 80mm Total 1640", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste MINI F56,55,57.xls"));
    const family = parseWorkbook(buf, "Produkteliste MINI F56,55,57.xls");
    const zwei = family.products.find((p) => p.name.startsWith("2 dÄHLer Edelstahl Endrohre 80mm"));
    const vier = family.products.find((p) => p.name.startsWith("4 dÄHLer Edelstahl Endrohre 80mm"));
    expect(zwei?.priceTotalChf).toBe(980);
    expect(zwei?.priceStatus).toBe("priced");
    expect(vier?.priceTotalChf).toBe(1640);
  });

  it("MINI F65, F66, F67: 2 Endrohre 80mm Total 980, 4 Endrohre 80mm Total 1640", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste MINI F65, F66, F67.xls"));
    const family = parseWorkbook(buf, "Produkteliste MINI F65, F66, F67.xls");
    const zwei = family.products.find((p) => p.name.startsWith("2 dÄHLer Edelstahl Endrohre 80mm"));
    const vier = family.products.find((p) => p.name.startsWith("4 dÄHLer Edelstahl Endrohre 80mm"));
    expect(zwei?.priceTotalChf).toBe(980);
    expect(vier?.priceTotalChf).toBe(1640);
  });
});

describe("Prüfer-Befund #4: \"ab\"-Präfix links der Teilepreis-Spalte", () => {
  it('3er G20, G21 Sportluftfilter: wird Produkt (on_request) statt Hinweis, price_note enthält "ab"', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 3er G20, G21.xls"));
    const family = parseWorkbook(buf, "Produkteliste 3er G20, G21.xls");
    const product = family.products.find((p) => p.name.startsWith("Sportluftfilter"));
    expect(product).toBeDefined();
    expect(product?.priceStatus).toBe("on_request");
    expect(product?.priceNote).toContain("ab");
    expect(family.notes.find((n) => n.text.startsWith("Sportluftfilter"))).toBeUndefined();
  });

  it("1er F20, F21 Zeile 23: Aufhebung V/max behält price_note \"ab\" trotz numerischem Total", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 1er F20, F21.xls"));
    const family = parseWorkbook(buf, "Produkteliste 1er F20, F21.xls");
    const product = family.products.find((p) => p.name.startsWith("Aufhebung der serienmässigen V/max"));
    expect(product?.priceStatus).toBe("priced");
    expect(product?.priceTotalChf).toBe(1480);
    expect(product?.priceNote).toContain("ab");
  });
});

describe("Prüfer-Befund #5: price_note auch bei priced, Apostroph-Zahlen", () => {
  // Prüfung Phase B, Punkt 8d: Teilepreis "auf Anfr." bei numerischem Total
  // bedeutet price_status "on_request", nicht "priced" (Total ist hier nur
  // die Montagepauschale 350, der eigentliche Teilepreis ist offen) - vorher
  // (Befund #5) galt hier fälschlich "priced", price_note blieb korrekt.
  it('2er F22, F23 Heckflügel GTS in GFK: price_status on_request (Teilepreis "auf Anfr."), price_note "auf Anfr."', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 2er F22, F23.xls"));
    const family = parseWorkbook(buf, "Produkteliste 2er F22, F23.xls");
    const product = family.products.find((p) => p.name.startsWith("Heckflügel GTS"));
    expect(product?.priceStatus).toBe("on_request");
    expect(product?.priceTotalChf).toBe(350);
    expect(product?.priceNote).toBe("auf Anfr.");
  });

  it('2er G42 Zeile 8: price_note "in Vorb." bleibt erhalten, obwohl price_status priced ist', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 2er G42.xls"));
    const family = parseWorkbook(buf, "Produkteliste 2er G42.xls");
    const product = family.products.find((p) => p.name.startsWith("(Basis 258 PS) 300 PS / 440 Nm"));
    expect(product?.priceStatus).toBe("priced");
    expect(product?.priceTotalChf).toBe(2960);
    expect(product?.priceNote).toBe("in Vorb.");
  });

  it("M3 / M4 G80-83 Seitenschürzen Satz M3: Teilepreis \"1'240\" wird numerisch geparst (1240)", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M3 M4 G80, G81, G82, G83.xls"));
    const family = parseWorkbook(buf, "Produkteliste M3 M4 G80, G81, G82, G83.xls");
    const product = family.products.find((p) => p.name === "Seitenschürzen Satz M3");
    expect(product?.pricePartsChf).toBe(1240);
    expect(product?.priceTotalChf).toBe(1320);
  });
});

describe("Prüfer-Befund #6: MINI F60 Countryman, doppelter Modellname", () => {
  it('"Countryman One" (Benzin/Diesel) wird disambiguiert, keine doppelten Modellnamen/Slugs', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste MINI F60 Countryman.xls"));
    const family = parseWorkbook(buf, "Produkteliste MINI F60 Countryman.xls");
    const names = family.models.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    const slugs = family.models.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(names).toContain("Countryman One (Benzin)");
    expect(names).toContain("Countryman One (Diesel)");
  });

  it("fits enthält keine doppelten Modellnamen mehr", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste MINI F60 Countryman.xls"));
    const family = parseWorkbook(buf, "Produkteliste MINI F60 Countryman.xls");
    for (const p of family.products) {
      expect(new Set(p.fits).size, `Zeile ${p.sourceRow} "${p.name}"`).toBe(p.fits.length);
    }
  });
});

describe("Prüfer-Befund #1 (Runde 2): Kraftstoff-Köpfe falsch positioniert", () => {
  it("X1 U11/X2 U10: 20i/23i ohne Kraftstoff, 30e/M35i fälschlich diesel, alle Fälle mit Warnung", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste X1 U11, X2 U10.xls"));
    const family = parseWorkbook(buf, "Produkteliste X1 U11, X2 U10.xls");
    // Der Parser folgt weiterhin der Doku (vorwärts auffüllen, kein Eingriff
    // in die Daten) ...
    expect(family.models.map((m) => [m.name, m.fuel])).toEqual([
      ["20i", null],
      ["23i", null],
      ["30e", "diesel"],
      ["M35i", "diesel"],
      ["18d", "diesel"],
      ["20d", "diesel"],
      ["23d", "diesel"],
    ]);
    // ... meldet die Unplausibilität aber als Warnung.
    const fuelWarnings = family.warnings.filter((w) => w.includes("Datenfehler"));
    expect(fuelWarnings.some((w) => w.includes('"20i"') && w.includes("keinen Kraftstoff"))).toBe(true);
    expect(fuelWarnings.some((w) => w.includes('"23i"') && w.includes("keinen Kraftstoff"))).toBe(true);
    expect(fuelWarnings.some((w) => w.includes('"30e"') && w.includes("nicht auf"))).toBe(true);
    expect(fuelWarnings.some((w) => w.includes('"M35i"') && w.includes("nicht auf"))).toBe(true);
    expect(fuelWarnings.some((w) => /Kraftstoff-Kopf "diesel" beginnt bei I1:P1/.test(w))).toBe(true);
  });

  it("7er G11, G12: M760i (Diesel-Merge beginnt eine Spalte zu früh) wird gemeldet", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 7er G11, G12.xls"));
    const family = parseWorkbook(buf, "Produkteliste 7er G11, G12.xls");
    expect(family.models.find((m) => m.name === "M760i")?.fuel).toBe("diesel");
    expect(
      family.warnings.some((w) => w.includes('"M760i"') && w.includes("nicht auf")),
    ).toBe(true);
  });

  it("4er G22, G23, G26: 20d/30d/M40d ohne Diesel-Kopf fälschlich benzin, wird gemeldet", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 4er G22, G23, G26.xls"));
    const family = parseWorkbook(buf, "Produkteliste 4er G22, G23, G26.xls");
    expect(family.models.find((m) => m.name === "20d")?.fuel).toBe("benzin");
    const fuelWarnings = family.warnings.filter((w) => w.includes("Datenfehler"));
    expect(fuelWarnings.some((w) => w.includes('"20d"'))).toBe(true);
    expect(fuelWarnings.some((w) => w.includes('"30d"'))).toBe(true);
    expect(fuelWarnings.some((w) => w.includes('"M40d"'))).toBe(true);
  });

  it("3er G20, G21 (unauffällige Datei): keine Kraftstoff-Datenfehler-Warnung", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 3er G20, G21.xls"));
    const family = parseWorkbook(buf, "Produkteliste 3er G20, G21.xls");
    expect(family.warnings.some((w) => w.includes("Datenfehler") && /Kraftstoff/i.test(w))).toBe(false);
  });
});

describe("Prüfer-Befund #2 (Runde 2): Leistungsdaten in \"(Basis...) ... PS / ... Nm\"-Fortsetzungszeile", () => {
  it("M3 F80/M4 F82: Stufe 1 und Stufe 2 behalten psBase/psTo/nmTo, seriesPsSuggested enthält alle drei Basiswerte", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M3 F80, M4 F82, F83.xls"));
    const family = parseWorkbook(buf, "Produkteliste M3 F80, M4 F82, F83.xls");
    const stufe1 = family.products.find((p) => p.name.startsWith("Leistungssteigerung Stufe 1"));
    expect(stufe1?.psBase).toEqual([431, 450, 460]);
    expect(stufe1?.psTo).toBe(510);
    expect(stufe1?.nmTo).toBe(700);
    const stufe2 = family.products.find((p) => p.name.startsWith("Leistungssteigerung Stufe 2"));
    expect(stufe2?.psBase).toEqual([431, 450, 460]);
    expect(stufe2?.psTo).toBe(540);
    expect(stufe2?.nmTo).toBe(720);
    for (const modelName of ["M3", "M4 Coupé", "M4 Cabi"]) {
      const model = family.models.find((m) => m.name === modelName);
      expect(model, modelName).toBeDefined();
      expect(model?.seriesPsSuggested, modelName).toEqual([431, 450, 460]);
    }
  });

  it('X3 G45: "DDE Leistungssteigerungen Dieselmotoren:" behält psBase/psTo/nmTo und wird als Datenfehler gemeldet', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste X3 G45.xls"));
    const family = parseWorkbook(buf, "Produkteliste X3 G45.xls");
    const product = family.products.find((p) => p.name.startsWith("DDE Leistungssteigerungen"));
    expect(product).toBeDefined();
    expect(product?.psBase).toEqual([197]);
    expect(product?.psTo).toBe(218);
    expect(product?.nmTo).toBe(470);
    expect(
      family.warnings.some((w) => w.includes("Gruppenzeile mit Marker/Preis") && w.includes("DDE Leistungssteigerungen")),
    ).toBe(true);
  });
});

describe('Befund #1 (Bericht Runde 3): "bestehend aus:"-Sonderregel entfernt, Regel 5b/6/7 greifen direkt', () => {
  it('X1 F48 Z75: "CDC1 Radsatz bestehend aus:" ist Produkt (Preis), Beschreibung enthält nur die Reifengrössen', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste X1 F48.xls"));
    const family = parseWorkbook(buf, "Produkteliste X1 F48.xls");
    const radsatz = family.products.find((p) => p.sourceRow === 75);
    expect(radsatz?.priceStatus).toBe("priced");
    expect(radsatz?.description).not.toContain("Adaptersatz");
    expect(radsatz?.description).toContain('8 x 20" mit 225/40 20 VA');
  });

  it('X1 F48 Z78: "Adaptersatz" (Artikelnummer, kein Preis) ist ein eigenes Produkt on_request (Regel 5b)', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste X1 F48.xls"));
    const family = parseWorkbook(buf, "Produkteliste X1 F48.xls");
    const adapter = family.products.find((p) => p.sourceRow === 78);
    expect(adapter?.name).toBe("Adaptersatz inkl. Radschrauben und Nabenkappen");
    expect(adapter?.priceStatus).toBe("on_request");
    expect(adapter?.priceNote).toBe("ohne Preisangabe");
  });

  it("5er F10, F11 Z128: Adaptersatz (nur RC, kein Marker/Artikelnummer) landet als Hinweis, nicht in einer Produkt-Beschreibung", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 5er F10, F11.xls"));
    const family = parseWorkbook(buf, "Produkteliste 5er F10, F11.xls");
    const note = family.notes.find((n) => n.text === "Adaptersatz inkl. Radschrauben und Nabenkappen");
    expect(note).toBeDefined();
    expect(note?.sourceCategory).toBe("Räder");
    for (const p of family.products) {
      expect(p.description ?? "", `Zeile ${p.sourceRow}`).not.toContain("Adaptersatz");
    }
  });

  it("X3 G01, X4 G02: Radsatz-Zeile ohne eigenen Preis (Prüfung Runde 5, Befund 1) - die Zeile selbst wird zum Produkt, die Dimensionszeile liefert Preis/RC/Marker und wandert in die Beschreibung", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste X3 G01, X4 G02.xls"));
    const family = parseWorkbook(buf, "Produkteliste X3 G01, X4 G02.xls");
    // Z86 "CDC1 FORGED Radsatz bestehend aus:" hat selbst keinen Preis; Z87
    // (die erste Reifengrösse, "9 x 20\" mit 245/45 20") trägt Preis 7200,
    // RC E und Marker. Vor der Korrektur (Prüfbericht Modul Parser, Befund
    // 1) wurde Z86 fälschlich zur Gruppenzeile und Z87 zum Produkt mit nur
    // der Dimension als Name - hier muss stattdessen Z86 selbst das
    // Produkt sein, mit dem Radsatznamen, group_label unverändert (null,
    // kein vorheriger echter Gruppentext seit dem Kategoriewechsel) und
    // variant_group "radsatz".
    const product = family.products.find((p) => p.sourceRow === 86);
    expect(product?.name).toBe("CDC1 FORGED Radsatz bestehend aus:");
    expect(product?.priceStatus).toBe("priced");
    expect(product?.priceTotalChf).toBe(7200);
    expect(product?.rc).toBe("E");
    expect(product?.fits.length).toBeGreaterThan(0);
    expect(product?.description).toContain('9 x 20"  mit 245/45 20');
    expect(product?.groupLabel).toBeNull();
    expect(product?.variantGroup).toBe("radsatz");
    // Die Reifengrössen-Zeile (Z87) selbst ist jetzt kein eigenes Produkt
    // mehr.
    expect(family.products.find((p) => p.sourceRow === 87)).toBeUndefined();
    // Die zugehörige Adaptersatz-Zeile (Z89, kein Preis, aber Artikelnummer)
    // ist ein eigenes on_request-Produkt (Regel 5b), nicht Teil der
    // Beschreibung, und erbt kein Gruppenlabel vom Radsatz mehr.
    const adapter = family.products.find((p) => p.sourceRow === 89);
    expect(adapter?.priceStatus).toBe("on_request");
    expect(adapter?.priceNote).toBe("ohne Preisangabe");
    expect(adapter?.groupLabel).toBeNull();
  });

  it("XM G09: Zubehör nach dem Radsatz-Block (Aufpreis, RDCi, Mobility) erbt kein Radsatz-Gruppenlabel mehr", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste XM G09.xls"));
    const family = parseWorkbook(buf, "Produkteliste XM G09.xls");
    const radsatz1 = family.products.find((p) => p.sourceRow === 47);
    expect(radsatz1?.name).toBe("CDC2 FORGED Radsatz bestehend aus:");
    expect(radsatz1?.priceTotalChf).toBe(10900);
    for (const row of [55, 56, 57]) {
      const product = family.products.find((p) => p.sourceRow === row);
      expect(product?.groupLabel, `Zeile ${row}`).toBeNull();
    }
  });

  it("M2 G87: Adaptersatz-Zeilen mit eigenem Preis (330) sind ganz normale priced-Produkte", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M2 G87.xls"));
    const family = parseWorkbook(buf, "Produkteliste M2 G87.xls");
    const adapters = family.products.filter((p) => p.name === "Adaptersatz inkl. Radschrauben und Nabenkappen");
    expect(adapters.length).toBe(4);
    for (const a of adapters) {
      expect(a.priceStatus, `Zeile ${a.sourceRow}`).toBe("priced");
      expect(a.priceTotalChf, `Zeile ${a.sourceRow}`).toBe(330);
    }
  });

  it("keine der 42 Dateien verwirft eine Adaptersatz-Zeile (keine ad-hoc Verwerfen-Sonderregel mehr)", async () => {
    const parsed = await parseAll();
    for (const { file, family } of parsed) {
      expect(
        family.warnings.some((w) => w.includes("Adaptersatz") && w.includes("verworfen")),
        file,
      ).toBe(false);
    }
  });
});

describe("Prüfer-Befund #4 (Runde 2): Gutachten-Hinweistext, Richtpreis und Trennstrich-Umbruch", () => {
  it("1er F20, F21: Richtpreis steht am Ende, kein Leerzeichen im Trennstrich-Umbruch", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 1er F20, F21.xls"));
    const family = parseWorkbook(buf, "Produkteliste 1er F20, F21.xls");
    const note = family.notes.find((n) => n.text.startsWith("Ein DTC"));
    // Befund #2 (Bericht Runde 3): der Trennstrich wird beim Umbruch
    // entfernt ("Leistungs-" + "steigerungen" -> "Leistungssteigerungen"),
    // nicht nur ohne Leerzeichen angehängt.
    expect(note?.text).toBe(
      "Ein DTC- / CH- Gutachten ist für die meisten Leistungssteigerungen vorhanden. Für die verbindliche Abklärung benötigen wir jedoch die Typengenehmigungsnummer Ihres Fahrzeugs! (Richtpreis CHF 450)",
    );
    expect(note?.text.includes("Leistungs-steigerungen")).toBe(false);
    expect(note?.text.includes("Leistungs- steigerungen")).toBe(false);
    expect(note?.text.includes("Leistungs- (Richtpreis")).toBe(false);
  });

  it("M2 G87: Trennstrich-Umbruch ohne Richtpreis entfernt den Trennstrich", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M2 G87.xls"));
    const family = parseWorkbook(buf, "Produkteliste M2 G87.xls");
    const note = family.notes.find((n) => n.text.startsWith("Ein DTC"));
    expect(note?.text).toBe("Ein DTC- / CH- Gutachten ist für alle Leistungssteigerungen vorhanden!");
  });

  it("X3 G45: Richtpreis steht am Ende, nicht mitten im Fortsetzungstext", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste X3 G45.xls"));
    const family = parseWorkbook(buf, "Produkteliste X3 G45.xls");
    const note = family.notes.find((n) => n.text.startsWith("Ein DTC"));
    expect(note?.text.endsWith("(Richtpreis CHF 450)")).toBe(true);
    expect(note?.text.includes("(Richtpreis CHF 450) Für die verbindliche")).toBe(false);
  });

  it('1er F20, F21: Trennstrich-Umbruch gilt auch für Namen ("höhen- u. härte-" + "verstellbar")', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 1er F20, F21.xls"));
    const family = parseWorkbook(buf, "Produkteliste 1er F20, F21.xls");
    const product = family.products.find((p) => p.name.startsWith("Sportfahrwerk Performance"));
    expect(product?.name).toBe("Sportfahrwerk Performance höhen- u. härteverstellbar (3-fach)");
    expect(product?.name.includes("härte- verstellbar")).toBe(false);
    expect(product?.name.includes("härte-verstellbar")).toBe(false);
  });
});

describe("Befund #3 (Bericht Runde 3): MINI F60 Auspuff - Regel 5b und Endrohre-Gruppenzeile", () => {
  it('Z45/46 "Edelstahlauspuffanlage"/"Komplettanlage" (RC D, Nummer "18 xxx", kein Preis) sind Produkte on_request', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste MINI F60 Countryman.xls"));
    const family = parseWorkbook(buf, "Produkteliste MINI F60 Countryman.xls");
    const anlage = family.products.find((p) => p.name === "Edelstahlauspuffanlage");
    const komplett = family.products.find((p) => p.name === "Komplettanlage");
    for (const p of [anlage, komplett]) {
      expect(p?.priceStatus).toBe("on_request");
      expect(p?.priceNote).toBe("ohne Preisangabe");
      expect(p?.fitsAll).toBe(true);
    }
  });

  it('Z48 "dÄHLer Endrohre ..." ist Gruppenzeile, die Endrohre-Produkte (Z50-52) bekommen das group_label', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste MINI F60 Countryman.xls"));
    const family = parseWorkbook(buf, "Produkteliste MINI F60 Countryman.xls");
    const endrohre = family.products.filter((p) => p.sourceRow >= 50 && p.sourceRow <= 52);
    expect(endrohre.length).toBe(3);
    for (const p of endrohre) {
      expect(p.groupLabel, `Zeile ${p.sourceRow}`).toBe(
        "dÄHLer Endrohre satin oder schwarz matt Keramik beschichtet",
      );
      expect(p.priceStatus, `Zeile ${p.sourceRow}`).toBe("priced");
    }
  });
});

describe("Befund #4 (Bericht Runde 3): Toyota GR Supra - Gruppenzeile ohne Doppelpunkt (DME-Präfix)", () => {
  it('"DME Leistungssteigerungen «powered by dÄHLer»" ist Gruppenzeile, kein Hinweis', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste Toyota GR Supra.xls"));
    const family = parseWorkbook(buf, "Produkteliste Toyota GR Supra.xls");
    expect(family.notes.some((n) => n.text.startsWith("DME Leistungssteigerungen"))).toBe(false);
    expect(family.products.some((p) => p.name.startsWith("DME Leistungssteigerungen"))).toBe(false);
  });

  it("die Leistungsstufe (variant_group leistung) danach bekommt dieses group_label", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste Toyota GR Supra.xls"));
    const family = parseWorkbook(buf, "Produkteliste Toyota GR Supra.xls");
    const stufe1 = family.products.find((p) => p.psTo === 240);
    expect(stufe1?.groupLabel).toBe("DME Leistungssteigerungen «powered by dÄHLer»");
  });

  // Prüfung Phase B, Punkt 8a (korrigiert eine frühere Erwartung dieses
  // Tests aus einer vorherigen Prüfrunde): "Carbon Air Intake" ist KEIN
  // Leistungsprodukt (variantGroupFor liefert null, kein "(Basis"/"Stufe X"/
  // "Leistungssteigerung" im Namen) - eine DME/DDE-Gruppenzeile gilt laut
  // aktueller Aufgabenstellung nur für die eigentlichen Leistungsstufen,
  // nicht für andere Motor-Produkte, die zufällig danach in derselben
  // Kategorie folgen.
  it("ein Nicht-Leistungsprodukt (Carbon Air Intake) danach bekommt KEIN group_label", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste Toyota GR Supra.xls"));
    const family = parseWorkbook(buf, "Produkteliste Toyota GR Supra.xls");
    const carbonIntake = family.products.find((p) => p.name === "Carbon Air Intake");
    expect(carbonIntake?.variantGroup).toBeNull();
    expect(carbonIntake?.groupLabel).toBeNull();
  });
});

// Prüfung Phase B, Punkt 8a: reale Zeile 2er F22, F23.xls - "Einbau
// Leistungssteigerung" (Zeile 22) folgt direkt auf die DDE-Gruppenzeile
// (Zeile 14) und auf zwei echte Leistungsstufen (Zeile 15/16), ist aber laut
// lib/catalog/variant-groups.ts ausdrücklich KEIN Leistungsprodukt (reine
// Montagepauschale zu einer an anderer Stelle gewählten Stufe).
describe("Prüfung Phase B, Punkt 8a: DME/DDE-group_label nur für variant_group \"leistung\"", () => {
  it('2er F22, F23: Leistungsstufen unter der DDE-Gruppenzeile behalten group_label, "Einbau Leistungssteigerung" darunter bekommt keins', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste 2er F22, F23.xls"));
    const family = parseWorkbook(buf, "Produkteliste 2er F22, F23.xls");

    const dieselStufen = family.products.filter(
      (p) => p.category === "motor" && p.variantGroup === "leistung" && (p.psTo === 220 || p.psTo === 232),
    );
    expect(dieselStufen.length).toBe(2);
    for (const p of dieselStufen) {
      expect(p.groupLabel, p.name).toBe("DDE Leistungssteigerungen Dieselmotoren:");
    }

    const einbau = family.products.find((p) => p.name === "Einbau Leistungssteigerung");
    expect(einbau?.variantGroup).toBeNull();
    expect(einbau?.groupLabel).toBeNull();
  });
});

// Prüfung Phase B, Punkt 8b: reale Zeile XM G09.xls - "Distanzscheiben
// (schwarz) Satz i.V. mit BMW Serien- od. M Performance Räder" trägt keine
// RC/Artikelnummer/Marker, aber als einzige Preiszelle den Text "in Vorb.":
// muss Gruppenzeile werden (mit Warnung), nicht Produkt ohne echten Preis.
describe('Prüfung Phase B, Punkt 8b: "Distanzscheiben"/"dÄHLer Endrohre" mit Text statt Preis -> Gruppenzeile', () => {
  it('XM G09: "Distanzscheiben ... i.V. mit ..." mit einziger Preiszelle "in Vorb." wird zur Gruppenzeile, nicht zum Produkt', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste XM G09.xls"));
    const family = parseWorkbook(buf, "Produkteliste XM G09.xls");

    const asProduct = family.products.find((p) =>
      p.name.startsWith("Distanzscheiben (schwarz) Satz i.V."),
    );
    expect(asProduct).toBeUndefined();

    expect(
      family.warnings.some(
        (w) => w.includes("Distanzscheiben (schwarz) Satz i.V.") && w.includes("Gruppenzeile"),
      ),
    ).toBe(true);

    // Die folgenden Produkte der Kategorie Räder tragen jetzt dieses
    // group_label (Regel 6 gilt bis zur nächsten Gruppenzeile/Kategorie).
    const afterward = family.products.find(
      (p) => p.category === "raeder" && p.sourceRow > 59,
    );
    expect(afterward?.groupLabel).toBe("Distanzscheiben (schwarz) Satz i.V. mit BMW Serien- od. M Performance Räder");
  });
});

describe("Befund #6 (Bericht Runde 3): pricePrefixCol nur unter Bedingungen als Preis-Präfix werten", () => {
  function buildSyntheticWorkbook(prefixHeader: string | null, prefixCellValue: unknown): Buffer {
    const aoa: unknown[][] = [
      [null, "dÄHLer Produkteliste", null, "RC", "Nummer", null, prefixHeader, null, null, null, null],
      [null, "Test G99", null, null, 12345, "20i", null, " CHF ", "CHF ", "CHF ", "CHF inkl. Mwst. "],
      [null, "Motor"],
      [null, "Filler Produkt", null, null, "11 11 111", null, null, null, null, null, 500],
      [null, "Testprodukt A", null, null, "22 22 222", null, prefixCellValue, null, null, null, null],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Planung");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  it("numerischer Wert in der Präfix-Spalte (gültiger Header \"Teilepreis\") wird nie als Preis übernommen", () => {
    // Simuliert eine interne Kalkulationsspalte, die zufällig an der
    // Präfix-Position liegt (siehe docs Sonderfälle: "4849.02" in Teile/
    // Komplettpreis). Ohne die Prüfung würde daraus fälschlich ein
    // Preis-Signal ("4849.02" als price_note).
    const buf = buildSyntheticWorkbook("Teilepreis", 4849.02);
    const family = parseWorkbook(buf, "test.xlsx");
    const product = family.products.find((p) => p.name === "Testprodukt A");
    expect(product).toBeDefined();
    expect(product?.priceStatus).toBe("on_request");
    expect(product?.priceNote).toBe("ohne Preisangabe");
  });

  it('kurzer Text in einer Spalte, deren Zeile-1-Bezeichnung nicht "Teilepreis" oder leer ist, wird ignoriert', () => {
    const buf = buildSyntheticWorkbook("Komplettpreis", "ab");
    const family = parseWorkbook(buf, "test.xlsx");
    const product = family.products.find((p) => p.name === "Testprodukt A");
    expect(product).toBeDefined();
    expect(product?.priceNote).toBe("ohne Preisangabe");
  });
});

describe("Befund #7 (Bericht Runde 3): Varianten-Gruppen auspuff - anlage vor endrohre", () => {
  it('"Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre" -> anlage (nicht endrohre)', () => {
    expect(variantGroupFor("auspuff", "Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre")).toBe(
      "anlage",
    );
  });

  it('"4 dÄHLer Edelstahl Endrohre 100mm schwarz matt" -> endrohre', () => {
    expect(variantGroupFor("auspuff", "4 dÄHLer Edelstahl Endrohre 100mm schwarz matt")).toBe("endrohre");
  });

  it('"Edelstahlauspuffanlage" -> anlage (neu: Auspuffanlage-Regex ergänzt)', () => {
    expect(variantGroupFor("auspuff", "Edelstahlauspuffanlage")).toBe("anlage");
  });

  it("Toyota GR Supra: Komplettanlage HP ohne Endrohre bekommt tatsächlich variant_group anlage", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste Toyota GR Supra.xls"));
    const family = parseWorkbook(buf, "Produkteliste Toyota GR Supra.xls");
    const product = family.products.find((p) => p.name.startsWith("Edelstahl Komplettanlage HP"));
    expect(product?.variantGroup).toBe("anlage");
  });
});

describe("Prüfbericht Modul Parser, Befund 2 (Runde 5): variant_group motor - Einbau/i.V.-Zusätze nicht exklusiv zur Stufe", () => {
  it('"Einbau Leistungssteigerung" -> null (Montagepauschale, kein eigenes Leistungsprodukt)', () => {
    expect(variantGroupFor("motor", "Einbau Leistungssteigerung")).toBeNull();
  });

  it('"Anhebung der serienmässigen V/max. Begr. auf 327km/h i.V. mit Leistungssteigerung" -> null', () => {
    expect(
      variantGroupFor(
        "motor",
        "Anhebung der serienmässigen V/max. Begr. auf 327km/h i.V. mit Leistungssteigerung",
      ),
    ).toBeNull();
  });

  it('"Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung" bleibt bewusst leistung (Exklusivität vertretbar)', () => {
    expect(
      variantGroupFor("motor", "Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung"),
    ).toBe("leistung");
  });

  it('"Stufe 1: (Basis 460 PS) 590PS / 720Nm ..." bleibt leistung (echte Leistungsstufe)', () => {
    expect(variantGroupFor("motor", "Stufe 1: (Basis 460 PS) 590PS / 720Nm (M2)")).toBe("leistung");
  });

  it("alle 42 Dateien: kein Produkt, dessen Name mit \"Einbau\" beginnt, hat variant_group leistung", async () => {
    const parsed = await parseAll();
    for (const { file, family } of parsed) {
      for (const p of family.products) {
        if (/^Einbau/i.test(p.name)) {
          expect(p.variantGroup, `${file} Zeile ${p.sourceRow}: "${p.name}"`).toBeNull();
        }
      }
    }
  });

  it("X3 G01, X4 G02 Z30: \"Einbau Leistungssteigerung\" ist im Flow nicht exklusiv zu Stufe 1/Stufe 2", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste X3 G01, X4 G02.xls"));
    const family = parseWorkbook(buf, "Produkteliste X3 G01, X4 G02.xls");
    const einbau = family.products.find((p) => p.name === "Einbau Leistungssteigerung");
    expect(einbau).toBeDefined();
    expect(einbau?.variantGroup).toBeNull();
  });

  it("M5 F10, M6 F06, F12, F13 Z18: \"Anhebung ... i.V. mit Leistungssteigerung\" ist im Flow nicht exklusiv zur Stufe", async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste M5 F10. M6 F06, F12, F13 .xls"));
    const family = parseWorkbook(buf, "Produkteliste M5 F10. M6 F06, F12, F13 .xls");
    const anhebung = family.products.find((p) => p.name.startsWith("Anhebung der serienmässigen V/max"));
    expect(anhebung).toBeDefined();
    expect(anhebung?.variantGroup).toBeNull();
  });
});

describe("Befund #8 (Bericht Runde 3): models[].name und slug je Familie eindeutig", () => {
  it('MINI F60 Countryman: "Countryman One" (Benzin/Diesel) eindeutig benannt', async () => {
    const buf = await readFile(join(PRICELIST_DIR, "Produkteliste MINI F60 Countryman.xls"));
    const family = parseWorkbook(buf, "Produkteliste MINI F60 Countryman.xls");
    expect(family.models.map((m) => m.name)).toContain("Countryman One (Benzin)");
    expect(family.models.map((m) => m.name)).toContain("Countryman One (Diesel)");
    expect(family.warnings.some((w) => w.includes('"Countryman One"') && w.includes("mehrfach"))).toBe(true);
  });

  it("alle 42 Dateien: models[].name und models[].slug sind je Familie eindeutig", async () => {
    const parsed = await parseAll();
    for (const { file, family } of parsed) {
      const names = family.models.map((m) => m.name);
      expect(new Set(names).size, `${file}: Namen ${JSON.stringify(names)}`).toBe(names.length);
      const slugs = family.models.map((m) => m.slug);
      expect(new Set(slugs).size, `${file}: Slugs ${JSON.stringify(slugs)}`).toBe(slugs.length);
    }
  });
});

describe("Leistungsdaten-Regex (parsePerformance)", () => {
  it("Stufe 1: (Basis 460 PS) 590PS / 720Nm (M...", () => {
    const r = parsePerformance("Stufe 1: (Basis 460 PS)  590PS / 720Nm (M6 & A8-Getriebe)");
    expect(r.psBase).toEqual([460]);
    expect(r.psTo).toBe(590);
    expect(r.nmTo).toBe(720);
  });

  it("(Basis 374 PS) Stufe 2: 455 PS / 640 Nm B58 ab 11/2020", () => {
    const r = parsePerformance("(Basis 374 PS) Stufe 2: 455 PS / 640 Nm B58 ab 11/2020");
    expect(r.psBase).toEqual([374]);
    expect(r.psTo).toBe(455);
    expect(r.nmTo).toBe(640);
  });

  it("Leistungssteigerung Stufe 1 (380PS/520Nm) mit Vmax-Aufhebung", () => {
    const r = parsePerformance("Leistungssteigerung Stufe 1 (380PS/520Nm) mit Vmax-Aufhebung");
    expect(r.psBase).toEqual([]);
    expect(r.psTo).toBe(380);
    expect(r.nmTo).toBe(520);
  });

  it("Stufe 1: (Basis 727 PS) 830 PS / 1'130 Nm, S68", () => {
    const r = parsePerformance("Stufe 1: (Basis 727 PS) 830 PS / 1'130 Nm, S68");
    expect(r.psBase).toEqual([727]);
    expect(r.psTo).toBe(830);
    expect(r.nmTo).toBe(1130);
  });

  it("(Basis 489 / 653 PS) Stufe 1: 753 PS/900 Nm S68", () => {
    const r = parsePerformance("(Basis 489 / 653 PS) Stufe 1: 753 PS/900 Nm S68");
    expect(r.psBase).toEqual([489, 653]);
    expect(r.psTo).toBe(753);
    expect(r.nmTo).toBe(900);
  });

  it("Basis mit Buchstaben-Code: (Basis S63 600/625 PS)", () => {
    const r = parsePerformance("Stufe 1: (Basis S63 600/625 PS) 700 PS / 1000 Nm");
    expect(r.psBase).toEqual([600, 625]);
  });

  it("Basis ohne Leerzeichen vor PS: (Basis 306/340PS)", () => {
    const r = parsePerformance("Stufe 3: (Basis 306/340PS) 408PS / 540 Nm");
    expect(r.psBase).toEqual([306, 340]);
  });

  it("Null-Fall: (Basis 381 PS) Stufe 1: PS /  Nm B58 -> psTo/nmTo null", () => {
    const r = parsePerformance("(Basis 381 PS) Stufe 1: PS /  Nm B58");
    expect(r.psBase).toEqual([381]);
    expect(r.psTo).toBeNull();
    expect(r.nmTo).toBeNull();
  });

  // Prüfung Phase B, Punkt 8c: Nm-Bereich statt einer einzelnen Zahl (echte
  // Zeile, 5er F10, F11.xls, Zeile 12: "(Basis 306 PS) 360 PS / 480 - 530 Nm
  // N55") - psTo ist die Zahl vor "PS", nmTo die OBERE Grenze des Bereichs
  // (530), nicht die untere (480) und nicht die untere selbst.
  it('Nm-Bereich "(Basis 306 PS) 360 PS / 480 - 530 Nm N55" -> psTo 360, nmTo 530 (oberer Wert)', () => {
    const r = parsePerformance("(Basis 306 PS) 360 PS / 480 - 530 Nm N55");
    expect(r.psBase).toEqual([306]);
    expect(r.psTo).toBe(360);
    expect(r.nmTo).toBe(530);
  });
});

describe("slug()", () => {
  it("M3 / M4 G80, G81, G82, G83 -> m3-m4-g80-g81-g82-g83", () => {
    expect(slug("M3 / M4 G80, G81, G82, G83")).toBe("m3-m4-g80-g81-g82-g83");
  });

  it("2er F44 Gran Coupé -> 2er-f44-gran-coupe", () => {
    expect(slug("2er F44 Gran Coupé")).toBe("2er-f44-gran-coupe");
  });

  it("M5 G90, M5 G99 Touring -> m5-g90-m5-g99-touring", () => {
    expect(slug("M5 G90, M5 G99 Touring")).toBe("m5-g90-m5-g99-touring");
  });
});
