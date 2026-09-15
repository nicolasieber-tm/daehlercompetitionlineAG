// Rückmeldung aus dem ersten Klicktest (Kundenflow M2 G87), siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkt 4: neue Exklusivgruppen exterieur/interieur,
// plus motor "ansaugung". Namen aus M2 G87 und 3er G20/G21 (docs/preislisten),
// per Stichprobe aus der laufenden DB geprüft.
import { describe, expect, it } from "vitest";
import { variantGroupFor } from "@/lib/catalog/variant-groups";

describe("variantGroupFor: exterieur frontgrill", () => {
  it("Frontgrill Carbon und Frontgrill CS Carbon sind exklusiv (M2 G87)", () => {
    expect(variantGroupFor("exterieur", "Frontgrill Carbon")).toBe("frontgrill");
    expect(variantGroupFor("exterieur", "Frontgrill CS Carbon")).toBe("frontgrill");
  });

  it("'Frontgrill Carbon gross / unten' bleibt kombinierbar (kein Ersatz für den oberen Grill)", () => {
    expect(variantGroupFor("exterieur", "Frontgrill Carbon gross / unten")).toBeNull();
  });

  it("Nieren-Varianten fallen ebenfalls in die frontgrill-Gruppe (3er G20/G21)", () => {
    expect(variantGroupFor("exterieur", "dÄHLer Niere M Doppelsteg schwarz glanz")).toBe("frontgrill");
    expect(variantGroupFor("exterieur", "dÄHLer Niere schwarz glanz")).toBe("frontgrill");
  });

  // Prüfung Modul Parser, Befund 4: der reine Anfangs-Anker "^Frontgrill"
  // griff bei 1er F40 nicht ("dÄHLer " steht davor) - beide Grills blieben
  // ohne Gruppe und gemeinsam wählbar, genau das gemeldete Klicktest-Problem.
  it("'dÄHLer Frontgrill ...'-Varianten sind exklusiv (1er F40)", () => {
    expect(variantGroupFor("exterieur", "dÄHLer Frontgrill Diamont schwarz glanz")).toBe("frontgrill");
    expect(variantGroupFor("exterieur", "dÄHLer Frontgrill doppelsteg schwarz glanz")).toBe("frontgrill");
  });
});

describe("variantGroupFor: exterieur heckdiffusor", () => {
  it("erfasst die tatsächliche Excel-Schreibweise 'Heckdifussor' (M2 G87)", () => {
    expect(variantGroupFor("exterieur", "Heckdifussor Carbon")).toBe("heckdiffusor");
    expect(variantGroupFor("exterieur", "Heckdifussor Race Carbon")).toBe("heckdiffusor");
  });

  it("erfasst auch die korrekte Schreibweise 'Heckdiffusor'", () => {
    expect(variantGroupFor("exterieur", "Heckdiffusor Carbon")).toBe("heckdiffusor");
  });
});

describe("variantGroupFor: exterieur frontspoiler/heckspoiler/motorhaube", () => {
  it("Frontspoilerlippe-Varianten (3er G20/G21)", () => {
    expect(variantGroupFor("exterieur", "Frontspoilerlippe 3 tlg. Schwarz matt")).toBe("frontspoiler");
    expect(variantGroupFor("exterieur", "Frontspoilerlippe 3 tlg. Schwarz glanz")).toBe("frontspoiler");
  });

  it("Heckspoiler und Heckflügel sind exklusiv (M2 G87)", () => {
    expect(variantGroupFor("exterieur", "Heckspoiler Carbon")).toBe("heckspoiler");
    expect(variantGroupFor("exterieur", "Heckflügel Carbon")).toBe("heckspoiler");
  });

  it("Motorhaube Carbon (M2 G87)", () => {
    expect(variantGroupFor("exterieur", "Motorhaube Carbon")).toBe("motorhaube");
  });

  // Prüfung Modul Parser, Befund 5: M2 F87 hatte alle vier Frontspoiler-
  // Produkte in einer Gruppe, obwohl "Frontspoilerlippe i.V. mit
  // Frontspoiler mittig" laut Namen die Kombination mit genau diesem
  // Produkt voraussetzt (kein Ersatz) und "Frontspoiler Flaps seitlich"
  // eine Ergänzung ist, keine Alternative.
  it("'i.V. mit'/'Flaps'-Varianten bleiben ausserhalb der frontspoiler-Gruppe kombinierbar (M2 F87)", () => {
    expect(variantGroupFor("exterieur", "Frontspoiler mittig")).toBe("frontspoiler");
    expect(variantGroupFor("exterieur", "Frontspoilerlippe i.V. mit Frontspoiler mittig")).toBeNull();
    expect(variantGroupFor("exterieur", "Frontspoiler Flaps seitlich")).toBeNull();
  });

  it("'in Verb. mit'/'in Verbindung mit'-Varianten bleiben ebenfalls kombinierbar", () => {
    expect(variantGroupFor("exterieur", "Frontspoilerlippe in Verb. mit Sportpaket")).toBeNull();
    expect(variantGroupFor("exterieur", "Frontspoilerlippe in Verbindung mit Sportpaket")).toBeNull();
  });
});

describe("variantGroupFor: interieur lenkrad", () => {
  it("Alcantara Sportlenkrad (M2 G87)", () => {
    expect(
      variantGroupFor(
        "interieur",
        "Alcantara Sportlenkrad in Verbindung mit allen Assistenzsystemen und Lenkradheizung",
      ),
    ).toBe("lenkrad");
  });

  // Prüfung Modul Parser, Befund 3: "Abgasklappensteuerung bedienbar über
  // Lenkradtaste" und "... Lenkrad-Griffbereich in Alcantara" sind keine
  // Lenkrad-ALTERNATIVEN zum Sportlenkrad. Wählte der Kunde das
  // Sportlenkrad, wurde die Abgasklappensteuerung fälschlich abgewählt.
  it("'Lenkradtaste'/'Griffbereich'-Nennungen sind KEINE Alternative zum Sportlenkrad (null statt 'lenkrad')", () => {
    expect(variantGroupFor("interieur", "Abgasklappensteuerung bedienbar über Lenkradtaste")).toBeNull();
    expect(
      variantGroupFor("interieur", "Abgasklappensteuerung bedienbar über Lenkradtaste oder Fernbedienung"),
    ).toBeNull();
    expect(
      variantGroupFor("interieur", "Farblich abgestimmte Steppnähte und Lenkrad-Griffbereich in Alcantara"),
    ).toBeNull();
  });
});

describe("variantGroupFor: motor ansaugung", () => {
  it("Sportluftfilter Satz und Carbon Air Intake sind exklusiv (M2 G87)", () => {
    expect(variantGroupFor("motor", "Sportluftfilter Satz")).toBe("ansaugung");
    expect(variantGroupFor("motor", "Carbon Air Intake")).toBe("ansaugung");
  });

  it("eine Leistungsstufe hat Vorrang vor 'ansaugung', falls sie zufällig beide Muster träfe", () => {
    expect(variantGroupFor("motor", "Stufe 1: (Basis 460 PS) 590PS / 720Nm Sportluftfilter")).toBe("leistung");
  });

  it("bestehende Motor-Produkte ohne diese Begriffe bleiben unberührt (null)", () => {
    expect(variantGroupFor("motor", "Motorabdeckung Carbon")).toBeNull();
    expect(variantGroupFor("motor", "Domstrebensatz Carbon / Schwarz")).toBeNull();
  });
});

// Nachzug Prüfung Phase D, Punkt 2: Kraftübertragung (source_category, Flow-
// Kategorie "motor", siehe docs/excel-import.md Kategorie-Mapping) -
// "Getriebeoptimierung St.1/St.2/St.3" sind drei alternative
// Programmierstufen, exklusiv zueinander. Reale Namen aus der DB.
describe("variantGroupFor: motor getriebeoptimierung", () => {
  it("Getriebeoptimierung St.1/St.2/St.3 sind exklusiv", () => {
    expect(variantGroupFor("motor", "Getriebeoptimierung St.1 / 8 HP")).toBe("getriebeoptimierung");
    expect(variantGroupFor("motor", "Getriebeoptimierung St.2 / 8 HP")).toBe("getriebeoptimierung");
    expect(variantGroupFor("motor", "Getriebeoptimierung St.3 / 8 HP")).toBe("getriebeoptimierung");
  });

  it("kein Konflikt mit 'leistung'/'ansaugung' (keiner der Getriebeoptimierung-Namen matcht diese Muster)", () => {
    expect(variantGroupFor("motor", "Stufe 1: (Basis 460 PS) 590PS / 720Nm")).toBe("leistung");
    expect(variantGroupFor("motor", "Sportluftfilter Satz")).toBe("ansaugung");
  });
});

// Nachzug Prüfung Phase D, Punkt 2: "Edelstahl Mittelschalldämpfer"/"...HP"
// vs. "Edelstahl H-Pipe Ersatz Mittelschalldämpfer"/"Edelstahl X-Rohr Ersatz
// Mittelschalldämpfer" sind alternative Mittelschalldämpfer-Ausführungen,
// exklusiv zueinander; "Komplettanlage" bleibt unverändert "anlage" (die
// anlage-Regel wird zuerst geprüft). Reale Namen aus der DB.
describe("variantGroupFor: auspuff mittelschalldaempfer", () => {
  it("Mittelschalldämpfer-Varianten sind exklusiv (reale Namen)", () => {
    expect(variantGroupFor("auspuff", "Edelstahl Mittelschalldämpfer")).toBe("mittelschalldaempfer");
    expect(variantGroupFor("auspuff", "Edelstahl Mittelschalldämpfer HP")).toBe("mittelschalldaempfer");
    expect(variantGroupFor("auspuff", "Edelstahl H-Pipe Ersatz Mittelschalldämpfer")).toBe("mittelschalldaempfer");
    expect(variantGroupFor("auspuff", "Edelstahl X-Rohr Ersatz Mittelschalldämpfer")).toBe("mittelschalldaempfer");
    expect(variantGroupFor("auspuff", "Edelstahlmittelschalldämpfer")).toBe("mittelschalldaempfer");
  });

  it("deckt auch 'X-Pipe' ab (in den 42 Preislisten bisher nicht vorkommend, Aufgabenstellung verlangt es trotzdem)", () => {
    expect(variantGroupFor("auspuff", "Edelstahl X-Pipe Ersatz Mittelschalldämpfer")).toBe("mittelschalldaempfer");
  });

  it("'Komplettanlage' bleibt 'anlage', die anlage-Regel wird zuerst geprüft", () => {
    expect(variantGroupFor("auspuff", "Edelstahl Komplettanlage HP")).toBe("anlage");
  });
});
