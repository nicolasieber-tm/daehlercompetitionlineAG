// Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): dieselbe Vorher/Nachher-
// Übersicht wie im Abschluss-Screen des Flows soll auch in den Kundenmails
// erscheinen. lib/catalog/before-after.ts buildBeforeAfterRows() ist die
// gemeinsame Basis dafür (siehe tests/flow/beforeAfter.test.ts für die
// bisherigen, unverändert grün bleibenden Prüfungen über den camelCase-
// Adapter components/flow/beforeAfter.ts).
import { describe, expect, it } from "vitest";
import { buildBeforeAfterRows } from "@/lib/catalog/before-after";
import type { BeforeAfterInput } from "@/lib/catalog/before-after";

function baseInput(overrides: Partial<BeforeAfterInput> = {}): BeforeAfterInput {
  return {
    categories: [],
    consulting: false,
    items: [],
    character: null,
    locale: "de",
    ...overrides,
  };
}

describe("lib/catalog/before-after.ts buildBeforeAfterRows", () => {
  // Vollablauf: mehrere Kategorien mit gewählten Produkten, inkl. Motor mit
  // Leistungsstufe (grosse Zahlen-Darstellung über row.power) und weiteren
  // gewählten Motor-Optionen (row.extras) - wie M2 G87, Stufe 1 +
  // Komplettanlage + Sportfedern + CDC2 aus der Aufgabenstellung.
  it("Vollablauf: alle Kategorien-Zeilen vorhanden, Leistungsstufe mit power/extras", () => {
    const rows = buildBeforeAfterRows(
      baseInput({
        categories: ["motor", "auspuff", "fahrwerk", "raeder"],
        items: [
          { category: "motor", name: "Stufe 1: (Basis 460 PS) 590PS / 720Nm", variant_group: "leistung", ps_to: 590, nm_to: 720 },
          { category: "motor", name: "Sportluftfilter Satz", variant_group: "ansaugung" },
          { category: "auspuff", name: "Komplettanlage" },
          { category: "fahrwerk", name: "Sportfedern" },
          { category: "raeder", name: "CDC2" },
        ],
        consulting: false,
        character: "sportlich",
        seriesPs: 460,
        seriesNm: 550,
        locale: "de",
      }),
    );
    expect(rows.map((r) => r.id)).toEqual(["leistung", "sound", "fahrwerk", "raeder", "charakter"]);

    const leistung = rows.find((r) => r.id === "leistung")!;
    expect(leistung.label).toBe("Leistung");
    expect(leistung.before).toBe("460 PS · 550 Nm");
    expect(leistung.after).toBe("590 PS · 720 Nm · Sportluftfilter Satz");
    expect(leistung.power).toEqual({ beforePs: 460, beforeNm: 550, afterPs: 590, afterNm: 720, diffPs: 130, diffNm: 170 });
    expect(leistung.extras).toBe("Sportluftfilter Satz");

    const sound = rows.find((r) => r.id === "sound")!;
    expect(sound.label).toBe("Sound");
    expect(sound.before).toBe("Serienanlage");
    expect(sound.after).toBe("Komplettanlage");

    const fahrwerk = rows.find((r) => r.id === "fahrwerk")!;
    expect(fahrwerk.after).toBe("Sportfedern");

    const raeder = rows.find((r) => r.id === "raeder")!;
    expect(raeder.after).toBe("CDC2");

    const charakter = rows.find((r) => r.id === "charakter")!;
    expect(charakter.after).toBe("Sportlich");
  });

  // Kurzablauf (CLAUDE.md Abschnitt "AUFGABE", Punkt 3): ohne Produktkatalog
  // (z.B. Wiesmann) zeigt jede gewählte Kategorie "Serie -> Beratung", ohne
  // seriesPs/seriesNm und ohne Positionen.
  it("Kurzablauf ohne Produkte: jede gewählte Kategorie zeigt Serie -> Beratung", () => {
    const rows = buildBeforeAfterRows(
      baseInput({
        categories: ["motor", "auspuff", "exterieur"],
        items: [],
        character: null,
        locale: "de",
      }),
    );
    const leistung = rows.find((r) => r.id === "leistung")!;
    expect(leistung.before).toBe("Serie");
    expect(leistung.after).toBe("Beratung");
    expect(leistung.power).toBeUndefined();

    const sound = rows.find((r) => r.id === "sound")!;
    expect(sound.after).toBe("Beratung");

    const exterieur = rows.find((r) => r.id === "exterieur")!;
    expect(exterieur.before).toBe("Serie");
    expect(exterieur.after).toBe("Beratung");

    // Charakter-Zeile ist immer enthalten, auch ohne gewählten Charakter.
    const charakter = rows.find((r) => r.id === "charakter")!;
    expect(charakter.after).toBe("Beratung");
  });

  // Motor gewählt, aber ohne Leistungsstufe (nur eine Nicht-Stufen-Option,
  // z.B. reine Software ohne PS-Angabe): kein power, before/after bleiben
  // Text - wie tests/flow/beforeAfter.test.ts, hier über die gemeinsame
  // Basis.
  it("Motor ohne gewählte Leistungsstufe: kein power, Produktname im Text", () => {
    const rows = buildBeforeAfterRows(
      baseInput({
        categories: ["motor"],
        items: [{ category: "motor", name: "Sportluftfilter Satz", variant_group: "ansaugung" }],
        seriesPs: 460,
        seriesNm: 550,
      }),
    );
    const leistung = rows.find((r) => r.id === "leistung")!;
    expect(leistung.power).toBeUndefined();
    expect(leistung.after).toBe("Sportluftfilter Satz");
  });

  it("EN: Kategorie-Labels und Beratungswert kommen aus dem englischen Dictionary", () => {
    const rows = buildBeforeAfterRows(
      baseInput({
        categories: ["motor", "auspuff"],
        items: [
          { category: "motor", name: "Stage 1: (base 460 hp) 590PS / 720Nm", variant_group: "leistung", ps_to: 590, nm_to: 720 },
        ],
        character: "sportlich",
        seriesPs: 460,
        seriesNm: 550,
        locale: "en",
      }),
    );
    const leistung = rows.find((r) => r.id === "leistung")!;
    expect(leistung.label).toBe("Power");
    expect(leistung.before).toBe("460 PS · 550 Nm");
    expect(leistung.after).toBe("590 PS · 720 Nm");

    const sound = rows.find((r) => r.id === "sound")!;
    expect(sound.label).toBe("Sound");
    expect(sound.before).toBe("Standard exhaust");
    expect(sound.after).toBe("Advice");

    const charakter = rows.find((r) => r.id === "charakter")!;
    expect(charakter.label).toBe("Character");
    expect(charakter.after).toBe("Sporty");
  });

  // Positionen im MailInquiryItem-Feldnamen-Format (inkl. price_status,
  // price_total) lassen sich ohne Um-Mapping direkt durchreichen (siehe
  // Dateikommentar lib/catalog/before-after.ts) - nur category/name/
  // variant_group/ps_to/nm_to fliessen in die Zeilen ein.
  it("nimmt Positionen im MailInquiryItem-Format ohne Um-Mapping entgegen", () => {
    const rows = buildBeforeAfterRows(
      baseInput({
        categories: ["auspuff"],
        items: [
          {
            category: "auspuff",
            name: "Klappenauspuffanlage",
            description: null,
            price_status: "priced",
          },
        ],
      }),
    );
    const sound = rows.find((r) => r.id === "sound")!;
    expect(sound.after).toBe("Klappenauspuffanlage");
  });
});
