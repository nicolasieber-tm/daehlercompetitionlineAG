// Getriebe aus dem Produktnamen ableiten, siehe CLAUDE.md Abschnitt
// "AUFGABE", Punkt 3, und lib/catalog/gearbox.ts. Namen aus M2 G87 (echte
// Kraftübertragung-Produkte, siehe docs/excel-import.md).
import { describe, expect, it } from "vitest";
import { gearboxFor, gearboxProductVisible } from "@/lib/catalog/gearbox";

describe("gearboxFor", () => {
  it("Schaltwegverkürzung für Handschalter -> manual", () => {
    expect(gearboxFor("Schaltwegverkürzung für Handschalter")).toBe("manual");
  });

  it("Getriebeoptimierung St.1 / 8 HP -> automatic", () => {
    expect(gearboxFor("Getriebeoptimierung St.1 / 8 HP")).toBe("automatic");
  });

  it("Getriebeoptimierung St.2 / 8 HP und St.3 / 8 HP -> automatic", () => {
    expect(gearboxFor("Getriebeoptimierung St.2 / 8 HP")).toBe("automatic");
    expect(gearboxFor("Getriebeoptimierung St.3 / 8 HP")).toBe("automatic");
  });

  it("'M6 & A8-Getriebe' in einem Leistungsstufen-Namen -> null (gilt für beide Getriebe)", () => {
    expect(gearboxFor("Stufe 1: (Basis 460 PS)  590PS / 720Nm (M6 & A8-Getriebe)")).toBeNull();
  });

  it("Differentialsperre -> null (getriebeneutral)", () => {
    expect(gearboxFor("Differentialsperre")).toBeNull();
  });

  it("8HP ohne Leerzeichen -> automatic", () => {
    expect(gearboxFor("Getriebeoptimierung 8HP")).toBe("automatic");
  });

  it("DKG/DCT/Steptronic/Wandler -> automatic", () => {
    expect(gearboxFor("Optimierung DKG")).toBe("automatic");
    expect(gearboxFor("Optimierung DCT")).toBe("automatic");
    expect(gearboxFor("Steptronic-Update")).toBe("automatic");
    expect(gearboxFor("Wandler-Optimierung")).toBe("automatic");
  });

  it("beide Muster gleichzeitig -> null (widersprüchlich)", () => {
    expect(gearboxFor("Handschalter- und Automat-Update")).toBeNull();
  });

  // Korrektur 15.09.2026 (Prüfung Modul Getriebe, Befund 1): "Schaltgetribe"
  // (Excel-Tippfehler, fehlendes "e") ist der reale, im Bestand vorkommende
  // Produktname (Z4 G29 Roadster, Kategorie Interieur), nicht Kraftüber-
  // tragung - das Muster ist deshalb bewusst nicht auf eine Kategorie
  // beschränkt. Ohne die Lockerung von "Schaltgetriebe" auf "Schaltgetr"
  // blieb dieses Produkt fälschlich getriebeneutral (null) statt "manual",
  // während das Gegenstück "dÄHLer Alupedale Automatik" bereits "automatic"
  // erhielt.
  it("dÄHLer Alupedale Schaltgetribe -> manual (Excel-Tippfehler, Z4 G29 Interieur)", () => {
    expect(gearboxFor("dÄHLer Alupedale Schaltgetribe")).toBe("manual");
  });

  it("dÄHLer Alupedale Automatik -> automatic (Gegenstück, war bereits korrekt)", () => {
    expect(gearboxFor("dÄHLer Alupedale Automatik")).toBe("automatic");
  });
});

describe("gearboxProductVisible", () => {
  it("getriebeneutrales Produkt ist immer sichtbar", () => {
    expect(gearboxProductVisible(null, "manual")).toBe(true);
    expect(gearboxProductVisible(null, "automatic")).toBe(true);
    expect(gearboxProductVisible(null, "unknown")).toBe(true);
    expect(gearboxProductVisible(null, null)).toBe(true);
  });

  it("ohne Antwort oder 'unknown' bleiben alle Produkte sichtbar", () => {
    expect(gearboxProductVisible("manual", null)).toBe(true);
    expect(gearboxProductVisible("automatic", "unknown")).toBe(true);
  });

  it("mit Antwort wird das jeweils andere Getriebe ausgeblendet", () => {
    expect(gearboxProductVisible("manual", "manual")).toBe(true);
    expect(gearboxProductVisible("manual", "automatic")).toBe(false);
    expect(gearboxProductVisible("automatic", "automatic")).toBe(true);
    expect(gearboxProductVisible("automatic", "manual")).toBe(false);
  });
});
