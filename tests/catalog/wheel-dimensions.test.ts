import { describe, expect, it } from "vitest";
import { formatWheelDescriptionLines, formatWheelDimensionLine } from "@/lib/catalog/wheel-dimensions";

describe("formatWheelDimensionLine", () => {
  it("Vorderachse und Hinterachse (de)", () => {
    expect(formatWheelDimensionLine('9 x 20" mit 255/30 20 VA', "de")).toBe("Vorderachse: 9 × 20 Zoll mit Bereifung 255/30 R20");
    expect(formatWheelDimensionLine('10.5x 20" mit 285/25 20 HA', "de")).toBe("Hinterachse: 10.5 × 20 Zoll mit Bereifung 285/25 R20");
  });

  it("ohne Achse, mit doppeltem Leerzeichen", () => {
    expect(formatWheelDimensionLine('9 x 20"  mit 245/30 20', "de")).toBe("9 × 20 Zoll mit Bereifung 245/30 R20");
  });

  it("englisch", () => {
    expect(formatWheelDimensionLine('9 x 20" mit 255/30 20 VA', "en")).toBe("Front axle: 9 × 20 inch with 255/30 R20 tyres");
    expect(formatWheelDimensionLine('10 x 20" mit 275/30 20 HA', "en")).toBe("Rear axle: 10 × 20 inch with 275/30 R20 tyres");
    expect(formatWheelDimensionLine('9 x 20" mit 245/30 20', "en")).toBe("9 × 20 inch with 245/30 R20 tyres");
  });

  it("Freiformen und alles andere bleiben wörtlich (null)", () => {
    expect(formatWheelDimensionLine("11 x 23 mit VA 285/ 35 23, HA 325/30 23 in Wunschfarbe lackiert", "de")).toBeNull();
    expect(formatWheelDimensionLine("Radsatz geschmiedet", "de")).toBeNull();
    expect(formatWheelDimensionLine('9 x 20" mit 255/30 20 VA lackiert', "de")).toBeNull();
  });

  it("formatWheelDescriptionLines: nicht passende Zeilen unverändert", () => {
    expect(formatWheelDescriptionLines(['9 x 20" mit 255/30 20 VA', "Wunschfarbe lackiert"], "de")).toEqual([
      "Vorderachse: 9 × 20 Zoll mit Bereifung 255/30 R20",
      "Wunschfarbe lackiert",
    ]);
  });
});
