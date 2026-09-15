// Rückmeldung aus dem ersten Klicktest (M2 G87): im Motor-Schritt waren
// zwei Leistungsstufen-Kacheln nicht unterscheidbar, siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkt 1, und lib/catalog/product-display.ts.
import { describe, expect, it } from "vitest";
import { displayItemFields, isStandaloneVmaxProduct, productDisplay } from "@/lib/catalog/product-display";

describe("productDisplay: variant_group leistung", () => {
  it("unterscheidet die beiden M2 G87 Stufe-1-Kacheln (Basis 460 PS), die vorher identisch aussahen", () => {
    const a = productDisplay(
      {
        name: "Stufe 1: (Basis 460 PS)  590PS / 720Nm (M6 & A8-Getriebe)",
        variant_group: "leistung",
        ps_to: 590,
        nm_to: 720,
      },
      "de",
    );
    const b = productDisplay(
      {
        name: "Stufe 1: (Basis 460 PS)  610PS / 750Nm (M6 & A8-Getriebe) inkl. Anhebung der V/max Begrenzung",
        variant_group: "leistung",
        ps_to: 610,
        nm_to: 750,
      },
      "de",
    );

    expect(a).toEqual({ title: "Stufe 1", subtitle: "590 PS / 720 Nm", detail: "M6 & A8-Getriebe" });
    expect(b).toEqual({
      title: "Stufe 1 mit V/max-Aufhebung",
      subtitle: "610 PS / 750 Nm",
      detail: "M6 & A8-Getriebe",
    });
    // Die beiden Kacheln müssen sich jetzt klar unterscheiden lassen.
    expect(a.title).not.toBe(b.title);
  });

  it("Titel 'Leistungssteigerung' ohne erkennbare Stufennummer, Bauzeitangabe im Titel (Befund 6)", () => {
    const d = productDisplay(
      { name: "(Basis 306 PS) 315 PS / 510 Nm B48 ab 11/2020", variant_group: "leistung", ps_to: 315, nm_to: 510 },
      "de",
    );
    expect(d.title).toBe("Leistungssteigerung ab 11/2020");
    expect(d.subtitle).toBe("315 PS / 510 Nm");
    expect(d.detail).toBe("B48");
  });

  it("eine Stufe mit 'bis 10.2020'-Zeithinweis (echter Name, Basis-Klammer VOR 'Stufe N:') - Bauzeit wandert in den Titel (Befund 6)", () => {
    const d = productDisplay(
      {
        name: "(Basis 360 PS) Stufe 1: 422PS / 600 Nm B58 inkl. V/max. Aufhebung bis 10.2020",
        variant_group: "leistung",
        ps_to: 422,
        nm_to: 600,
      },
      "de",
    );
    expect(d.title).toBe("Stufe 1 mit V/max-Aufhebung bis 10.2020");
    expect(d.subtitle).toBe("422 PS / 600 Nm");
    expect(d.detail).toBe("B58");
  });

  it("V/max-Zusatz mit 'inkl. Aufh. der V/max Begr.' (andere Wortstellung/Abkürzung, N63Tü) - Bauzeit im Titel", () => {
    const d = productDisplay(
      {
        name: "(Basis 530 PS) Stufe 1: 600 PS / 830 Nm N63Tü inkl. Aufh. der V/max Begr. bis 6.20",
        variant_group: "leistung",
        ps_to: 600,
        nm_to: 830,
      },
      "de",
    );
    expect(d.title).toBe("Stufe 1 mit V/max-Aufhebung bis 6.20");
    expect(d.detail).toBe("N63Tü");
  });

  // Prüfung Modul Parser, Befund 6: fünf Fälle mit sonst identischem Titel+
  // Nebenzeile innerhalb desselben Modells, die sich vorher nur noch in der
  // kleinen Detailzeile unterschieden (z.B. x7-g07 "bis 10.20" vs.
  // "ab 10.21"). Reale Namen aus der DB (Basis 340 PS, 390 PS / 780 Nm).
  it("Bauzeitangabe 'ab 10.20' vs. 'ab 10.21' macht zwei sonst identische Stufen im Titel unterscheidbar", () => {
    const a = productDisplay(
      { name: "(Basis 340 PS) 390 PS / 780 Nm ab 10.20", variant_group: "leistung", ps_to: 390, nm_to: 780 },
      "de",
    );
    const b = productDisplay(
      { name: "(Basis 340 PS) 390 PS / 780 Nm ab 10.21", variant_group: "leistung", ps_to: 390, nm_to: 780 },
      "de",
    );
    expect(a.title).toBe("Leistungssteigerung ab 10.20");
    expect(b.title).toBe("Leistungssteigerung ab 10.21");
    expect(a.title).not.toBe(b.title);
    expect(a.subtitle).toBe(b.subtitle);
  });

  it("Bauzeitangabe 'bis 10.20' (reales Duplikat, X1 F48)", () => {
    const d = productDisplay(
      { name: "(Basis 340 PS) 390 PS / 780 Nm bis 10.20", variant_group: "leistung", ps_to: 390, nm_to: 780 },
      "de",
    );
    expect(d.title).toBe("Leistungssteigerung bis 10.20");
    expect(d.detail).toBe("");
  });

  // Prüfung Modul Parser, Befund 1: ein eigenständiges V/max-Produkt "...
  // ohne Leistungssteigerung" liegt bewusst in variant_group "leistung"
  // (Exklusivität, siehe lib/catalog/variant-groups.ts), ist aber keine
  // Stufe - Titel muss der Name bleiben, nicht "Leistungssteigerung mit
  // V/max-Aufhebung".
  it("'... ohne Leistungssteigerung' wird trotz variant_group 'leistung' NICHT als Stufe angezeigt", () => {
    const d = productDisplay(
      {
        name: "Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung",
        variant_group: "leistung",
        ps_to: null,
        nm_to: null,
      },
      "de",
    );
    expect(d.title).toBe("Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung");
    expect(d.subtitle).toBe("");
    expect(d.detail).toBe("");
  });

  it("isStandaloneVmaxProduct: true nur bei 'ohne Leistungssteigerung'", () => {
    expect(isStandaloneVmaxProduct("Aufhebung der serienmässigen V/max Begrenzung ohne Leistungssteigerung")).toBe(
      true,
    );
    expect(isStandaloneVmaxProduct("Stufe 1: (Basis 460 PS) 590PS / 720Nm (M6 & A8-Getriebe)")).toBe(false);
  });

  // Prüfung Modul Parser, Befund 2: die description wurde bisher komplett
  // verworfen - 8 aktive Stufen tragen die V/max-Angabe (teilweise) nur
  // dort. Reale Namen/descriptions aus der DB.
  it("V/max-Angabe ausschliesslich in der description (X1 F48 25d/25i): unterscheidet zwei sonst identische Stufen", () => {
    const withoutVmax = productDisplay(
      { name: "(Basis 231 PS) 260 PS / 490 Nm B47", variant_group: "leistung", ps_to: 260, nm_to: 490 },
      "de",
    );
    const withVmax = productDisplay(
      {
        name: "(Basis 231 PS) 260 PS / 490 Nm B47",
        description: "Anhebung der serienmässigen V/max Begrenzung",
        variant_group: "leistung",
        ps_to: 260,
        nm_to: 490,
      },
      "de",
    );
    expect(withoutVmax.title).toBe("Leistungssteigerung");
    expect(withVmax.title).toBe("Leistungssteigerung mit V/max-Aufhebung");
    expect(withVmax.subtitle).toBe(withoutVmax.subtitle);
    expect(withVmax.detail).toBe("B47");
    expect(withoutVmax.title).not.toBe(withVmax.title);
  });

  it("V/max-Phrase über Name UND description gesplittet (M3 F80, reale Excel-Zeile)", () => {
    const d = productDisplay(
      {
        name: "Leistungssteigerung Stufe 1: (Basis 431/450/460 PS) 510 PS / 700 Nm inkl. Aufhebung der serienmässigen",
        description: "V/max Begrenzung",
        variant_group: "leistung",
        ps_to: 510,
        nm_to: 700,
      },
      "de",
    );
    expect(d.title).toBe("Stufe 1 mit V/max-Aufhebung");
    expect(d.subtitle).toBe("510 PS / 700 Nm");
  });

  it("Stufe ohne Restinformation: detail ist leer", () => {
    const d = productDisplay(
      { name: "Stufe 1: (Basis 510 PS) 630PS / 780Nm", variant_group: "leistung", ps_to: 630, nm_to: 780 },
      "de",
    );
    expect(d.detail).toBe("");
  });

  it("Englisch: gleiches Zahlenformat, lokalisierter Titel", () => {
    const d = productDisplay(
      {
        name: "Stufe 1: (Basis 460 PS)  590PS / 720Nm (M6 & A8-Getriebe)",
        variant_group: "leistung",
        ps_to: 590,
        nm_to: 720,
      },
      "en",
    );
    expect(d.title).toBe("Stage 1");
    expect(d.subtitle).toBe("590 PS / 720 Nm");
    expect(d.detail).toBe("M6 & A8-Getriebe");
  });

  // Nachzug Prüfung Phase D, Punkt 3: "V-max" (Bindestrich statt Leerzeichen/
  // Schrägstrich) wurde von der Detail-Bereinigung bisher nicht erkannt
  // (nur von der Titel-Erkennung, zufällig, über den Wildcard-Punkt in der
  // alten Regex) und blieb deshalb als Rest-Text in der Detailzeile stehen.
  // Reale Namen aus der DB, M3 / M4 G80, G81, G82, G83.
  it("'V-max.' (Bindestrich, M3/M4 G80) wird wie 'V/max'/'Vmax' erkannt und aus der Detailzeile entfernt", () => {
    const d = productDisplay(
      {
        name: "Stufe 1: (Basis 480 PS) 650PS / 750Nm ( M6 & A8-Getriebe ) inkl. V-max. Aufhebung",
        variant_group: "leistung",
        ps_to: 650,
        nm_to: 750,
      },
      "de",
    );
    expect(d.title).toBe("Stufe 1 mit V/max-Aufhebung");
    expect(d.subtitle).toBe("650 PS / 750 Nm");
    // Vorher blieb hier "M6 & A8-Getriebe ) inkl. V-max. Aufhebung" (oder
    // Ähnliches) stehen; die V/max-Phrase ist bereits im Titel abgebildet.
    expect(d.detail).toBe("M6 & A8-Getriebe");
    expect(d.detail).not.toContain("V-max");
  });

  it("'V-max.' mit zusätzlichem Freitext ('Competition'/'Competition Lci'/'CS') bleibt als unterscheidendes Detail erhalten, ohne die V/max-Phrase", () => {
    const competition = productDisplay(
      {
        name: "Stufe 1: (Basis 510 PS) 650PS / 770Nm Competition  inkl. V-max. Aufhebung",
        variant_group: "leistung",
        ps_to: 650,
        nm_to: 770,
      },
      "de",
    );
    const competitionLci = productDisplay(
      {
        name: "Stufe 1: (Basis 530 PS) 660PS / 780Nm Competition Lci  inkl. V-max. Aufhebung",
        variant_group: "leistung",
        ps_to: 660,
        nm_to: 780,
      },
      "de",
    );
    const cs = productDisplay(
      {
        name: "Stufe 1: (Basis 550 PS) 660PS / 810Nm CS  inkl. V-max. Aufhebung",
        variant_group: "leistung",
        ps_to: 660,
        nm_to: 810,
      },
      "de",
    );
    expect(competition.title).toBe("Stufe 1 mit V/max-Aufhebung");
    expect(competition.detail).toBe("Competition");
    expect(competitionLci.detail).toBe("Competition Lci");
    expect(cs.detail).toBe("CS");
  });

  // Reale Namen 1er M E82 (siehe docs/excel-import.md, Beispiel für
  // ps_to/nm_to aus dem Namen): "mit Vmax-Aufhebung" hängt das Lift-Wort per
  // Bindestrich statt Leerzeichen an "Vmax" an; das führende
  // "Leistungssteigerung" vor "Stufe N" gehört ebenfalls zum Präfix (bereits
  // im Titel "Stufe N" abgebildet), nicht in die Detailzeile.
  it("'mit Vmax-Aufhebung' (Bindestrich vor dem Lift-Wort, 1er M E82): Detail leer, kein 'Leistungssteigerung'-Rest", () => {
    const stage1 = productDisplay(
      {
        name: "Leistungssteigerung Stufe 1 (380PS/520Nm) mit Vmax-Aufhebung",
        variant_group: "leistung",
        ps_to: 380,
        nm_to: 520,
      },
      "de",
    );
    const stage4 = productDisplay(
      {
        name: "Leistungssteigerung Stufe 4 (445PS/600Nm) mit Vmax-Aufhebung",
        variant_group: "leistung",
        ps_to: 445,
        nm_to: 600,
      },
      "de",
    );
    expect(stage1.title).toBe("Stufe 1 mit V/max-Aufhebung");
    expect(stage1.subtitle).toBe("380 PS / 520 Nm");
    expect(stage1.detail).toBe("");
    expect(stage4.title).toBe("Stufe 4 mit V/max-Aufhebung");
    expect(stage4.detail).toBe("");
  });

  it("ohne erkennbare Stufennummer: 'Leistungssteigerung mit Vmax-Aufhebung' -> Titel 'Leistungssteigerung mit V/max-Aufhebung', Detail leer", () => {
    const d = productDisplay(
      { name: "Leistungssteigerung mit Vmax-Aufhebung", variant_group: "leistung", ps_to: null, nm_to: null },
      "de",
    );
    expect(d.title).toBe("Leistungssteigerung mit V/max-Aufhebung");
    expect(d.subtitle).toBe("");
    expect(d.detail).toBe("");
  });
});

describe("productDisplay: andere Produkte", () => {
  it("Titel ist der Name (NBSP normalisiert), Subtitle/Detail aus der Beschreibung", () => {
    const nameWithNbsp = "CDC1 FORGED Radsatz geschmiedet bestehend aus:";
    const d = productDisplay(
      {
        name: nameWithNbsp,
        description: '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20',
      },
      "de",
    );
    expect(d.title).toBe("CDC1 FORGED Radsatz geschmiedet bestehend aus:");
    expect(d.title).not.toContain(" ");
    expect(d.subtitle).toBe('10 x 20" mit 275/30 20');
    expect(d.detail).toBe('10 x 20" mit 285/30 20');
  });

  it("ohne Beschreibung bleiben subtitle/detail leer", () => {
    const d = productDisplay({ name: "Aufhebung der serienmässigen V/max Begrenzung" }, "de");
    expect(d).toEqual({ title: "Aufhebung der serienmässigen V/max Begrenzung", subtitle: "", detail: "" });
  });
});

describe("displayItemFields: Positionszeilen für Antwortentwurf/Mails", () => {
  it("faltet Titel+Subtitle+Detail zu einem Namen zusammen, Beschreibung wird geleert (Motor-Leistungsstufe)", () => {
    const r = displayItemFields(
      {
        name: "Stufe 1: (Basis 460 PS)  590PS / 720Nm (M6 & A8-Getriebe)",
        description: null,
        isStage: true,
        psTo: 590,
        nmTo: 720,
      },
      "de",
    );
    expect(r.name).toBe("Stufe 1 (590 PS / 720 Nm, M6 & A8-Getriebe)");
    expect(r.description).toBeNull();
    expect(r.originalName).toBe("Stufe 1: (Basis 460 PS)  590PS / 720Nm (M6 & A8-Getriebe)");
  });

  it("nicht-Motor-Positionen bleiben unverändert (Beschreibung wird nicht angetastet)", () => {
    const r = displayItemFields(
      { name: "Heckdifussor Carbon", description: "Nur mit M-Heckschürze kombinierbar", isStage: false, psTo: null, nmTo: null },
      "de",
    );
    expect(r.name).toBe("Heckdifussor Carbon");
    expect(r.description).toBe("Nur mit M-Heckschürze kombinierbar");
    expect(r.originalName).toBeNull();
  });
});
