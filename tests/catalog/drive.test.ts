// Antrieb aus dem Produktnamen (Entscheid 21.09.2026), siehe
// lib/catalog/drive.ts. Echte Zeilen aus 5er F10/F11 und M3/M4 G80.
import { describe, expect, it } from "vitest";
import { driveFor, driveFromText, driveProductVisible } from "@/lib/catalog/drive";

describe("driveFor", () => {
  it("«..., ohne xdrive» -> rwd, «..., mit xdrive» -> xdrive", () => {
    expect(driveFor("Sportfahrwerk Performance höhen- u. härteverstellbar (3-fach), ohne xdrive")).toBe("rwd");
    expect(driveFor("Sportfahrwerk Performance höhen- u. härteverstellbar (3-fach), mit xdrive")).toBe("xdrive");
  });
  it("«für M3 xDrive» -> xdrive", () => {
    expect(driveFor("Sportfedernsatz für M3 xDrive / -27mm / HA 16mm")).toBe("xdrive");
  });
  it("Motorisierungs-Kürzel («i/xi», «20xd - 35/40xi») bleiben neutral", () => {
    expect(driveFor("Sportfedernsatz für F10 8-Zylinder i/xi")).toBeNull();
    expect(driveFor("Stabisatz 20xd - 35/40xi")).toBeNull();
    expect(driveFor("Sportfedersatz -25mm 320xi-320xd/330d")).toBeNull();
  });
});

describe("driveProductVisible", () => {
  it("neutral immer, ohne Antwort alle, sonst nur passend", () => {
    expect(driveProductVisible(null, "xdrive")).toBe(true);
    expect(driveProductVisible("rwd", null)).toBe(true);
    expect(driveProductVisible("rwd", "rwd")).toBe(true);
    expect(driveProductVisible("rwd", "xdrive")).toBe(false);
  });
});

describe("driveFromText", () => {
  it("erkennt xDrive/Allrad und Heckantrieb/sDrive", () => {
    expect(driveFromText("530d xDrive")).toBe("xdrive");
    expect(driveFromText("Allrad")).toBe("xdrive");
    expect(driveFromText("Heckantrieb")).toBe("rwd");
    expect(driveFromText("sDrive")).toBe("rwd");
    expect(driveFromText(null)).toBeNull();
    expect(driveFromText("Touring")).toBeNull();
  });
});
