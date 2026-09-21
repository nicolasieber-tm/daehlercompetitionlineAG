// Antrieb (xDrive / Heckantrieb) aus dem Produktnamen ableiten und im Flow
// filtern. Entscheid 21.09.2026, zusammen mit der Karosserieform (siehe
// lib/catalog/body-style.ts). Die Excel-Preisliste nennt den Antrieb nur
// im Produktnamen, und nur bei wenigen Fahrwerksprodukten:
//   «Sportfahrwerk Performance ... (3-fach), ohne xdrive» -> rwd
//   «Sportfahrwerk Performance ... (3-fach), mit xdrive»  -> xdrive
//   «Sportfedernsatz für M3 xDrive / -27mm / HA 16mm»      -> xdrive
// Alles andere («i/xi», «20xd - 35/40xi», Motorisierungsbereiche wie
// «320xi-320xd») bleibt antriebsneutral - der Antrieb steckt dort in der
// Motorisierung, nicht im Produkt, und wird bewusst nicht geraten.
import type { Drive } from "@/lib/db/rows";

export const DRIVE_ORDER: readonly Drive[] = ["rwd", "xdrive"];

export function isDrive(value: unknown): value is Drive {
  return typeof value === "string" && (DRIVE_ORDER as readonly string[]).includes(value);
}

const RWD_PATTERN = /\bohne\s*x-?drive\b/i;
const XDRIVE_PATTERN = /\bx-?drive\b/i;

/** Antrieb aus dem Produktnamen, null wenn antriebsneutral. */
export function driveFor(name: string): Drive | null {
  if (RWD_PATTERN.test(name)) return "rwd";
  if (XDRIVE_PATTERN.test(name)) return "xdrive";
  return null;
}

/**
 * true, wenn ein Produkt beim gewählten Antrieb sichtbar bleiben soll:
 * neutrale Produkte immer; ohne Antwort alle; sonst nur passende.
 */
export function driveProductVisible(productDrive: Drive | null, chosen: Drive | null): boolean {
  if (productDrive === null) return true;
  if (chosen === null) return true;
  return productDrive === chosen;
}

/** Antrieb aus einem Klartext (Schnellweg-Extraktion), null wenn unklar. */
export function driveFromText(text: string | null | undefined): Drive | null {
  if (!text) return null;
  if (/\b(heckantrieb|hinterradantrieb|ohne\s*x-?drive|sdrive|rear.?wheel|rwd)\b/i.test(text)) return "rwd";
  if (/\b(x-?drive|allrad|all.?wheel|awd|4x4)\b/i.test(text)) return "xdrive";
  return null;
}
