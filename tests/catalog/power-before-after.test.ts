// Rückmeldung zweiter Klicktest (Kundenflow M2 G87), siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkt 3: Vorher/Nachher-Leistung wie beforeAfter()
// in docs/vorschau.html («<b>530</b> PS · 650 Nm» → «<b>640</b> PS · 750
// Nm»), plus grünes Plus. Werte aus der echten M2 G87 Basis-480-Stufe mit
// V/max-Aufhebung (siehe docs/db.md): 480 PS Serie -> Stufe 1 640 PS / 770
// Nm.
import { describe, expect, it } from "vitest";
import {
  buildPowerBeforeAfter,
  formatPowerAfterText,
  formatPowerBeforeText,
  formatPowerLine,
  formatPowerPlusText,
} from "@/lib/catalog/power-before-after";

describe("buildPowerBeforeAfter", () => {
  it("mit Stufe und bekanntem series_nm: Vorher/Nachher inkl. Nm-Differenz", () => {
    const power = buildPowerBeforeAfter(480, 550, 640, 770);
    expect(power).toEqual({ beforePs: 480, beforeNm: 550, afterPs: 640, afterNm: 770, diffPs: 160, diffNm: 220 });
    expect(formatPowerBeforeText(power!)).toBe("480 PS / 550 Nm");
    expect(formatPowerAfterText(power!)).toBe("640 PS / 770 Nm");
    expect(formatPowerPlusText(power!)).toBe("+160 PS / +220 Nm");
    expect(formatPowerLine(power!)).toBe("480 PS / 550 Nm → 640 PS / 770 Nm (+160 PS / +220 Nm)");
  });

  it("mit Stufe, aber OHNE bekanntes series_nm: keine Nm-Angabe vorher, kein Nm-Anteil im Plus", () => {
    // Reale M2 G87 "M2" Daten: models.series_nm ist nicht gesetzt (siehe
    // docs/db.md), nur die Zielleistung der Stufe ist bekannt.
    const power = buildPowerBeforeAfter(460, null, 610, 750);
    expect(power).toEqual({ beforePs: 460, beforeNm: null, afterPs: 610, afterNm: 750, diffPs: 150, diffNm: null });
    expect(formatPowerBeforeText(power!)).toBe("460 PS");
    expect(formatPowerAfterText(power!)).toBe("610 PS / 750 Nm");
    expect(formatPowerPlusText(power!)).toBe("+150 PS");
    expect(formatPowerLine(power!)).toBe("460 PS → 610 PS / 750 Nm (+150 PS)");
  });

  it("ohne gewählte Stufe (afterPs unbekannt): null", () => {
    expect(buildPowerBeforeAfter(460, 550, null, null)).toBeNull();
    expect(buildPowerBeforeAfter(460, 550, undefined, undefined)).toBeNull();
  });

  it("ohne bekannte Serienleistung (beforePs unbekannt): null", () => {
    expect(buildPowerBeforeAfter(null, null, 610, 750)).toBeNull();
  });
});
