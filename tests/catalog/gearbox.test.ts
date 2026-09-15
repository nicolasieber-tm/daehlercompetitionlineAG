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

  // Nachzug Prüfung Phase D, Punkt 7: reale Namen aus der DB. Der M4 GTS
  // (F82) war ausschliesslich mit M-DKG-Doppelkupplungsgetriebe erhältlich,
  // nie mit Handschaltung - eine von ihm übernommene Getriebeprogrammierung
  // ist damit eindeutig DKG-/Automat-spezifisch.
  it("Getriebeprogramm aus M4 GTS -> automatic (M2/M2 Competition/M2 CS F87, M4 GTS = reines DKG-Modell)", () => {
    expect(gearboxFor("Getriebeprogramm aus M4 GTS")).toBe("automatic");
  });

  it("Getriebe- DSC Programmierung vom M4 GTS -> automatic (M3 F80/M4 F82, F83)", () => {
    expect(gearboxFor("Getriebe- DSC Programmierung vom M4 GTS")).toBe("automatic");
  });

  // "GTS" allein bleibt getriebeneutral - nur "Getriebe...GTS" ist
  // spezifisch. Sonst würden getriebeunabhängige GTS-Zubehörteile
  // fälschlich als automat-exklusiv gelten (reale Namen aus der DB).
  it("GTS-Zubehör ohne 'Getriebe' im Namen bleibt getriebeneutral (kein Bezug zur Getriebeprogrammierung)", () => {
    expect(gearboxFor("Heckflügel GTS in GFK")).toBeNull();
    expect(gearboxFor("Heckflügel GTS in Wagenfarbe")).toBeNull();
    expect(gearboxFor("M3 GTS Heckflügel für F32")).toBeNull();
  });

  // Nachzug Prüfung Phase D, Punkt 7: "Differentialsperre mit kürzerer
  // Uebersetzung" (reale Namen, 1er F20/F21 und 2er F22/F23) bleibt
  // bewusst UNVERÄNDERT getriebeneutral - eine kürzere Achsübersetzung am
  // Differential ist eine mechanische Ratio-Änderung, die unabhängig vom
  // Getriebetyp (Hand- oder Automatikgetriebe) funktioniert; anders als
  // beim M4 GTS gibt es hier kein eindeutiges Signal für eine der beiden
  // Varianten.
  it("Differentialsperre mit kürzerer Uebersetzung -> null (getriebeneutral, kein eindeutiges Signal)", () => {
    expect(gearboxFor("Differentialsperre mit kürzerer Uebersetzung")).toBeNull();
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
