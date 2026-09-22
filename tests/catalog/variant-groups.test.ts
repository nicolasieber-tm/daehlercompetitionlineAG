// Rückmeldung aus dem ersten Klicktest (Kundenflow M2 G87), siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkt 4: neue Exklusivgruppen exterieur/interieur,
// plus motor "ansaugung". Namen aus M2 G87 und 3er G20/G21 (docs/preislisten),
// per Stichprobe aus der laufenden DB geprüft.
import { describe, expect, it } from "vitest";
import { axleOf, variantGroupFor, variantsConflict } from "@/lib/catalog/variant-groups";

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
  // Seit 22.09.2026 liegen die Abgasklappen-Bedienwege in der eigenen Gruppe
  // "klappensteuerung" (siehe unten), entscheidend bleibt: nicht "lenkrad".
  it("'Lenkradtaste'/'Griffbereich'-Nennungen sind KEINE Alternative zum Sportlenkrad (nie 'lenkrad')", () => {
    expect(variantGroupFor("interieur", "Abgasklappensteuerung bedienbar über Lenkradtaste")).not.toBe("lenkrad");
    expect(
      variantGroupFor("interieur", "Abgasklappensteuerung bedienbar über Lenkradtaste oder Fernbedienung"),
    ).not.toBe("lenkrad");
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

// Rückmeldung Klicktest 22.09.2026 («drei Distanzscheiben auswählen macht
// keinen Sinn», «bei den Bremsbelägen konnte ich alle auswählen»). Reale
// Namen aus der DB.
describe("variantGroupFor: raeder distanzscheiben / radoberflaeche", () => {
  it("Distanzscheiben-Grössen sind exklusiv (beide Schreibweisen im Bestand)", () => {
    expect(variantGroupFor("raeder", "Distanzscheibe 4mm")).toBe("distanzscheiben");
    expect(variantGroupFor("raeder", "Distanzscheibe 12.5mm")).toBe("distanzscheiben");
    expect(variantGroupFor("raeder", "Distanzscheibe 3mm schwarz eloxiert (2 Stk.)")).toBe("distanzscheiben");
  });

  it("Radschrauben und DTC-Gutachten aus derselben Gruppenzeile bleiben kombinierbar", () => {
    expect(variantGroupFor("raeder", "Satz Radschrauben (schwarz)")).toBeNull();
    expect(variantGroupFor("raeder", "Satz Radschrauben schwarz brüniert (20Stk)")).toBeNull();
    expect(variantGroupFor("raeder", "DTC Gutachten zu Distanzscheiben")).toBeNull();
  });

  it("Rad-Oberflächen-Aufpreise (Lackierung vs. frontpoliert) sind exklusiv", () => {
    expect(variantGroupFor("raeder", "Aufpreis für Lackierung in beliebiger Farbe")).toBe("radoberflaeche");
    expect(variantGroupFor("raeder", 'Aufpreis in "dÄHLer-Edition" frontpoliert')).toBe("radoberflaeche");
    expect(variantGroupFor("raeder", "Aufpreis Räder in Wunschfarbe lackiert")).toBe("radoberflaeche");
  });

  it("Radsätze und übriges Zubehör bleiben wie bisher", () => {
    expect(variantGroupFor("raeder", "CDC2 FORGED Radsatz geschmiedet bestehend aus:")).toBe("radsatz");
    expect(variantGroupFor("raeder", "Adaptersatz inkl. Radschrauben und Nabenkappen")).toBeNull();
    expect(variantGroupFor("raeder", "Satz RDCi-Sensoren")).toBeNull();
  });
});

describe("variantGroupFor: fahrwerk bremsbelaege / bremsanlage", () => {
  it("Belag-Varianten (beide Achsen, VA, HA, Keramik, Track-Race) liegen in einer Gruppe", () => {
    expect(variantGroupFor("fahrwerk", "Sportbremsbeläge für Serienbremsanlage für M3, M4")).toBe("bremsbelaege");
    expect(variantGroupFor("fahrwerk", "Sportbremsbeläge für Serienbremsanlage VA")).toBe("bremsbelaege");
    expect(variantGroupFor("fahrwerk", "Sportbremsbeläge für Serienbremsanlage HA")).toBe("bremsbelaege");
    expect(variantGroupFor("fahrwerk", "Sportbremsbeläge für Serien-Keramikanlage")).toBe("bremsbelaege");
    expect(variantGroupFor("fahrwerk", "Sportbremsbelag für Serienbremsanlage")).toBe("bremsbelaege");
    expect(variantGroupFor("fahrwerk", "Bremsbelagsatz Track - Race F4x VA (für M-Bremse)")).toBe("bremsbelaege");
  });

  it("Hochleistungsbremsanlagen 356/380 mm sind exklusiv, Stahlflex bleibt Ergänzung", () => {
    expect(variantGroupFor("fahrwerk", "Hochleistungsbremsanlage, 356mm/8 Kolben")).toBe("bremsanlage");
    expect(variantGroupFor("fahrwerk", "Hochleistungsbremsanlage, 380mm/8 Kolben")).toBe("bremsanlage");
    expect(variantGroupFor("fahrwerk", "Hochleistungsbremse 8-Kolben 380mm")).toBe("bremsanlage");
    expect(variantGroupFor("fahrwerk", "Hochleistungsbremsanlage VA")).toBe("bremsanlage");
    expect(variantGroupFor("fahrwerk", "Stahlflexbremsleitungen")).toBeNull();
    expect(variantGroupFor("fahrwerk", "Stahlflex - Bremsleitungen")).toBeNull();
  });

  it("Fahrwerks-Varianten bleiben in 'fahrwerk', Einbausätze kombinierbar", () => {
    expect(variantGroupFor("fahrwerk", "Sportfedersatz -25mm 318i-320d")).toBe("fahrwerk");
    expect(variantGroupFor("fahrwerk", "Einbausatz i.V. mit adaptivem M-Fahrwerk erforderlich")).toBeNull();
  });
});

describe("variantGroupFor: interieur klappensteuerung", () => {
  it("Bedienwege der Abgasklappe sind exklusiv (M2 F87), inkl. Excel-Tippfehler", () => {
    expect(variantGroupFor("interieur", "Abgasklappensteuerung bedienbar über Lenkradtaste")).toBe("klappensteuerung");
    expect(variantGroupFor("interieur", "Abgasklappensteuerung bedienbar über Lenkradtaste oder Fernbedienung")).toBe(
      "klappensteuerung",
    );
    expect(variantGroupFor("interieur", "Abgasklappensteuerung mit Fernbedienung")).toBe("klappensteuerung");
    expect(variantGroupFor("interieur", "Abgasklappenstuerung")).toBe("klappensteuerung");
  });

  it("das MID-Display mit Klappensteuerung bleibt ausserhalb (Anker am Namensanfang)", () => {
    expect(variantGroupFor("interieur", "Multiinformations Display MID mit Abgasklappenstuerung")).toBeNull();
  });
});

describe("axleOf / variantsConflict", () => {
  it("erkennt VA und HA als Wort, beide zusammen oder keines ergibt null", () => {
    expect(axleOf("Sportbremsbeläge für Serienbremsanlage VA")).toBe("va");
    expect(axleOf("Sportbremsbeläge für Serienbremsanlage HA")).toBe("ha");
    expect(axleOf("Hochleistungsbremsanlage VA/HA, 6/4 Kolben 380/400mm")).toBeNull();
    expect(axleOf("Sportbremsbeläge für Serienbremsanlage für M3, M4")).toBeNull();
    expect(axleOf("Stahlflexbremsleitungen für M135i F21")).toBeNull();
  });

  it("VA und HA derselben Gruppe schliessen sich nicht aus", () => {
    const va = { variantGroup: "bremsbelaege", name: "Sportbremsbeläge für Serienbremsanlage VA" };
    const ha = { variantGroup: "bremsbelaege", name: "Sportbremsbeläge für Serienbremsanlage HA" };
    expect(variantsConflict(va, ha)).toBe(false);
    expect(variantsConflict(va, { ...va, name: "Bremsbelagsatz Track - Race F2x/F8x VA" })).toBe(true);
  });

  it("ein Produkt ohne Achsangabe verdrängt VA und HA derselben Gruppe", () => {
    const both = { variantGroup: "bremsbelaege", name: "Sportbremsbeläge für Serienbremsanlage" };
    const va = { variantGroup: "bremsbelaege", name: "Sportbremsbeläge für Serienbremsanlage VA" };
    expect(variantsConflict(both, va)).toBe(true);
    expect(variantsConflict(va, both)).toBe(true);
  });

  it("ausserhalb der achsbezogenen Gruppen ist «HA» nur eine Massangabe, die Varianten bleiben exklusiv (M3/M4 G80)", () => {
    const a = { variantGroup: "fahrwerk", name: "Sportfedernsatz für M3 xDrive / -28mm / HA 8mm" };
    const b = { variantGroup: "fahrwerk", name: "Sportfedernsatz für M3 xDrive / VA -20mm" };
    expect(axleOf(a.name)).toBe("ha");
    expect(variantsConflict(a, b)).toBe(true);
  });

  it("ohne Gruppe oder mit verschiedenen Gruppen nie ein Konflikt", () => {
    expect(variantsConflict({ variantGroup: null, name: "A" }, { variantGroup: null, name: "B" })).toBe(false);
    expect(
      variantsConflict({ variantGroup: "distanzscheiben", name: "Distanzscheibe 4mm" }, { variantGroup: "radsatz", name: "CDC1 Radsatz" }),
    ).toBe(false);
    expect(
      variantsConflict({ variantGroup: "distanzscheiben", name: "Distanzscheibe 4mm" }, { variantGroup: "distanzscheiben", name: "Distanzscheibe 11mm" }),
    ).toBe(true);
  });
});
