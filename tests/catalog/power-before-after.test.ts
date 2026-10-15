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
  it("mit Stufe: vorher nur PS, nachher PS und Ziel-Nm, Plus nur PS (Rückmeldung dÄHLer 15.10.2026)", () => {
    const power = buildPowerBeforeAfter(460, 610, 750);
    expect(power).toEqual({ beforePs: 460, afterPs: 610, afterNm: 750, diffPs: 150 });
    expect(formatPowerBeforeText(power!)).toBe("460 PS");
    expect(formatPowerAfterText(power!)).toBe("610 PS / 750 Nm");
    expect(formatPowerPlusText(power!)).toBe("+150 PS");
    expect(formatPowerLine(power!)).toBe("460 PS → 610 PS / 750 Nm (+150 PS)");
  });

  it("ohne gewählte Stufe (afterPs unbekannt): null", () => {
    expect(buildPowerBeforeAfter(460, null, null)).toBeNull();
    expect(buildPowerBeforeAfter(460, undefined, undefined)).toBeNull();
  });

  it("ohne bekannte Serienleistung (beforePs unbekannt): null", () => {
    expect(buildPowerBeforeAfter(null, 610, 750)).toBeNull();
  });
});
