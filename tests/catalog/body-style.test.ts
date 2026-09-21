// Karosserieform aus dem Produktnamen (Entscheid 21.09.2026), siehe
// lib/catalog/body-style.ts und docs/excel-import.md, Abschnitt
// «Karosserieform und Antrieb». Alle Namen sind echte Zeilen aus den
// Preislisten in docs/preislisten.
import { describe, expect, it } from "vitest";
import {
  assignBodyStyles,
  bodyStyleFromText,
  bodyStyleProductVisible,
  bodyStylesFor,
  familyBodyStyles,
  stripBodyTokens,
} from "@/lib/catalog/body-style";

const G20 = ["G20", "G21"];
const F30 = ["F30", "F31", "F34", "F35"];
const F32 = ["F32", "F33", "F36"];
const G8 = ["G14", "G15", "G16", "F91", "F92", "F93"];
const MINI = ["F56", "F55", "F57"];

describe("familyBodyStyles", () => {
  it("3er G20, G21 -> Limousine und Touring", () => {
    expect(familyBodyStyles(G20)).toEqual(["limousine", "touring"]);
  });
  it("3er F30, F31, F34, F35 -> Limousine, Touring, Gran Turismo (F35 zählt als Limousine)", () => {
    expect(familyBodyStyles(F30)).toEqual(["limousine", "touring", "gran_turismo"]);
  });
  it("MINI F56, F55, F57 -> 3-Türer, 5-Türer, Cabrio", () => {
    expect(familyBodyStyles(MINI)).toEqual(["cabrio", "dreituerer", "fuenftuerer"]);
  });
  it("Familien ohne Karosserie-Unterschied (X5 G05/X6 G06, Z4, 7er G11/G12) -> höchstens eine Karosserieform", () => {
    expect(familyBodyStyles(["G05", "G06"])).toEqual([]);
    expect(familyBodyStyles(["G29"])).toEqual([]);
    expect(familyBodyStyles(["G11", "G12"])).toEqual(["limousine"]);
  });
});

describe("bodyStylesFor: Wort im Namen", () => {
  it("«... Touring» -> touring", () => {
    expect(bodyStylesFor("Sportfahrwerk höhenverstellbar Touring", G20)).toEqual(["touring"]);
    expect(bodyStylesFor("Sportfedersatz -25mm 318i-320d Touring", G20)).toEqual(["touring"]);
  });
  it("«... Cabrio» / «... Coupé» / «... Gran Coupé»", () => {
    expect(bodyStylesFor("Sportfedersatz Cabrio", MINI)).toEqual(["cabrio"]);
    expect(bodyStylesFor("Sportfedersatz -25mm 420i-420d Coupé", ["G22", "G23", "G26"])).toEqual(["coupe"]);
    expect(bodyStylesFor("Sportfedersatz G16 Gran Coupé", G8)).toEqual(["gran_coupe"]);
    expect(bodyStylesFor("Sportfedersatz -25mm M8 Cabrio, F91", G8)).toEqual(["cabrio"]);
  });
  it("«Gran Coupé» zählt nicht zusätzlich als Coupé", () => {
    expect(bodyStylesFor("Sportfedersatz G16 Gran Coupé", G8)).not.toContain("coupe");
  });
  it("«für M4 Cabrio xDrive» in der M3/M4-Familie -> cabrio", () => {
    expect(bodyStylesFor("Sportfedernsatz für M4 Cabrio xDrive höhenverstellbar", ["G80", "G81", "G82", "G83"])).toEqual(["cabrio"]);
  });
  it("ohne Karosserie-Wort/-Code -> leer (neutral)", () => {
    expect(bodyStylesFor("Sportfahrwerk höhenverstellbar", G20)).toEqual([]);
    expect(bodyStylesFor("Stabisatz 20xd - 35/40xi", F30)).toEqual([]);
    expect(bodyStylesFor("Sützlager verstellbar VA", G20)).toEqual([]);
  });
});

describe("bodyStylesFor: Baureihen-Code im Namen", () => {
  it("«... G20» -> limousine, «... G31» -> touring", () => {
    expect(bodyStylesFor("EB Satz i.V. mit Adaptivem M-Fahrwerk G20", G20)).toEqual(["limousine"]);
    expect(bodyStylesFor("Sportfedersatz -25mm G31", ["G30", "G31", "G38"])).toEqual(["touring"]);
    expect(bodyStylesFor("Sportfedersatz -25mm G30", ["G30", "G31", "G38"])).toEqual(["limousine"]);
  });
  it("Excel-Kurzschreibweise «F31,34» / «F31, 34» / «F32/36» / «F32 F36»: die nackte Zahl erbt den Buchstaben", () => {
    expect(bodyStylesFor("Sportfedernsatz F31,34", F30)).toEqual(["touring", "gran_turismo"]);
    expect(bodyStylesFor("Sportfahrwerk höhenverstellbar F31, 34", F30)).toEqual(["touring", "gran_turismo"]);
    expect(bodyStylesFor("Sportfahrwerk Performance höhen- u. härteverstellbar (3-fach) F32/36", F32)).toEqual(["coupe", "gran_coupe"]);
    expect(bodyStylesFor("Sportfedernsatz F32 F36", F32)).toEqual(["coupe", "gran_coupe"]);
    expect(bodyStylesFor("Sportfedernsatz F33", F32)).toEqual(["cabrio"]);
  });
  it("«F30,» mit Komma am Ende (echte Excel-Zeile) -> limousine", () => {
    expect(bodyStylesFor("Sportfedernsatz F30,", F30)).toEqual(["limousine"]);
  });
  it("«für F11 4-Zylinder» -> touring, «für F10 ...» -> limousine", () => {
    expect(bodyStylesFor("Sportfedernsatz für F11 4-Zylinder", ["F10", "F11"])).toEqual(["touring"]);
    expect(bodyStylesFor("Sportfedernsatz für F10 8-Zylinder i/xi", ["F10", "F11"])).toEqual(["limousine"]);
  });
  it("nennt der Name ALLE Karosserieformen der Familie, ist er neutral («F31,34, F35 30e»)", () => {
    expect(bodyStylesFor("Sportfedernsatz F31,34, F35 30e", F30)).toEqual([]);
  });
  it("Codes anderer Familien zählen nicht", () => {
    expect(bodyStylesFor("M3 GTS Heckflügel für F32", F30)).toEqual([]);
  });
  it("Familie mit nur einer Karosserieform: nie eine Zuordnung (7er G11/G12)", () => {
    expect(bodyStylesFor("Sportfedersatz G11", ["G11", "G12"])).toEqual([]);
  });
});

describe("stripBodyTokens", () => {
  it("entfernt Wort und Code und normalisiert", () => {
    expect(stripBodyTokens("Sportfahrwerk höhenverstellbar Touring", G20)).toBe("sportfahrwerk höhenverstellbar");
    expect(stripBodyTokens("Sportfahrwerk höhenverstellbar F31, 34", F30)).toBe("sportfahrwerk höhenverstellbar");
    expect(stripBodyTokens("Sportfedernsatz F30,", F30)).toBe("sportfedernsatz");
    expect(stripBodyTokens("Sportfedersatz -25mm G15 Coupé", G8)).toBe("sportfedersatz -25mm");
  });
});

describe("assignBodyStyles: Geschwister-Regel", () => {
  function p(name: string, sourceCategory = "Fahrwerk") {
    return { name, sourceCategory, bodyStyles: [] as ReturnType<typeof bodyStylesFor> };
  }

  it("3er G20/G21: das unbeschriftete Gegenstück eines Touring-Produkts wird Limousine", () => {
    const products = [
      p("Sportfahrwerk höhenverstellbar"),
      p("Sportfahrwerk höhenverstellbar"),
      p("Sportfahrwerk höhenverstellbar Touring"),
      p("Sportfahrwerk höhenverstellbar Touring"),
      p("Sportfedersatz -25mm 318i-320d"),
      p("Sportfedersatz -25mm 318i-320d Touring"),
      p("Sützlager verstellbar VA"),
    ];
    const { warnings } = assignBodyStyles(products, G20);
    expect(products.map((x) => x.bodyStyles)).toEqual([
      ["limousine"],
      ["limousine"],
      ["touring"],
      ["touring"],
      ["limousine"],
      ["touring"],
      [],
    ]);
    expect(warnings.length).toBe(3);
  });

  it("MINI F56/F55/F57: «Sportfedersatz» ohne Zusatz gilt für 3-Türer und 5-Türer, nicht für das Cabrio", () => {
    const products = [p("Sportfedersatz"), p("Sportfedersatz Cabrio"), p("Sportfahrwerk verstellbar")];
    assignBodyStyles(products, MINI);
    expect(products[0].bodyStyles).toEqual(["dreituerer", "fuenftuerer"]);
    expect(products[1].bodyStyles).toEqual(["cabrio"]);
    expect(products[2].bodyStyles).toEqual([]);
  });

  it("2er F22/F23: «Sportfedernsatz -25 mm» neben «... Cabrio» wird Coupé", () => {
    const products = [p("Sportfedernsatz -25 mm"), p("Sportfedernsatz -25 mm"), p("Sportfedernsatz -25 mm Cabrio")];
    assignBodyStyles(products, ["F22", "F23"]);
    expect(products[0].bodyStyles).toEqual(["coupe"]);
    expect(products[1].bodyStyles).toEqual(["coupe"]);
    expect(products[2].bodyStyles).toEqual(["cabrio"]);
  });

  it("Geschwister-Regel nur innerhalb derselben Excel-Kategorie", () => {
    const products = [p("Sportfedersatz", "Räder"), p("Sportfedersatz Cabrio", "Fahrwerk")];
    assignBodyStyles(products, MINI);
    expect(products[0].bodyStyles).toEqual([]);
  });

  it("kein Gegenstück mit anderem Text: bleibt neutral («320xi-320xd/330d» vs. «320xd/330d/330xi Touring»)", () => {
    const products = [p("Sportfedersatz -25mm 320xi-320xd/330d"), p("Sportfedersatz -25mm 320xd/330d/330xi Touring")];
    assignBodyStyles(products, G20);
    expect(products[0].bodyStyles).toEqual([]);
    expect(products[1].bodyStyles).toEqual(["touring"]);
  });

  it("Familie, die die Karosserie über die Motorisierung unterscheidet (M3 Touring, M4 Cabrio): überall leer", () => {
    const products = [
      p("Sportfedernsatz für M4 xDrive höhenverstellbar"),
      p("Sportfedernsatz für M4 Cabrio xDrive höhenverstellbar"),
      p("Heckspoiler Carbon  M3 G80", "Karosserie"),
    ];
    assignBodyStyles(products, ["G80", "G81", "G82", "G83"], ["M3/Comp.", "M3 CS", "M3 Touring", "M4/Comp.", "M4 Cabrio", "M4 CSL"]);
    expect(products.every((x) => x.bodyStyles.length === 0)).toBe(true);
  });

  it("Familie mit nur einer Karosserieform: überall leer", () => {
    const products = [p("Sportfedersatz G11"), p("Sportfedersatz G11")];
    assignBodyStyles(products, ["G11", "G12"]);
    expect(products.every((x) => x.bodyStyles.length === 0)).toBe(true);
  });
});

describe("bodyStyleProductVisible", () => {
  it("neutrale Produkte immer sichtbar, ohne Antwort alle sichtbar", () => {
    expect(bodyStyleProductVisible([], "touring")).toBe(true);
    expect(bodyStyleProductVisible(["touring"], null)).toBe(true);
  });
  it("mit Antwort nur passende Produkte", () => {
    expect(bodyStyleProductVisible(["touring"], "touring")).toBe(true);
    expect(bodyStyleProductVisible(["touring"], "limousine")).toBe(false);
    expect(bodyStyleProductVisible(["touring", "gran_turismo"], "gran_turismo")).toBe(true);
    expect(bodyStyleProductVisible(["dreituerer", "fuenftuerer"], "cabrio")).toBe(false);
  });
});

describe("bodyStyleFromText", () => {
  it("Modell-Alternativen der 4er-Baureihe", () => {
    expect(bodyStyleFromText("Cabrio")).toBe("cabrio");
    expect(bodyStyleFromText("Coupé")).toBe("coupe");
    expect(bodyStyleFromText("Grand Coupé")).toBe("gran_coupe");
  });
  it("Freitext aus dem Schnellweg", () => {
    expect(bodyStyleFromText("340i Touring")).toBe("touring");
    expect(bodyStyleFromText("Kombi")).toBe("touring");
    expect(bodyStyleFromText("Limousine")).toBe("limousine");
  });
  it("nichts oder mehrdeutig -> null", () => {
    expect(bodyStyleFromText("X2")).toBeNull();
    expect(bodyStyleFromText(null)).toBeNull();
    expect(bodyStyleFromText("Coupé oder Cabrio")).toBeNull();
  });
});
