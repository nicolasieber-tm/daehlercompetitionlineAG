// Anzeigename für Familie/Modell im Kundenflow, z.B. "BMW M2 (G87)" oder
// "Wiesmann". Dünner Wrapper um die gemeinsame, reine Formel in
// lib/catalog/vehicle-label.ts (siehe dort, docs/architektur.md Abschnitt
// "Fahrzeugbezeichnung", und lib/mail/render.ts vehicleLabel(), die
// dieselbe Funktion für die volle DB-Row-Form aufrufen) - vorher gab es
// hier eine eigene, separate Kopie derselben Regel gegen die schlankeren,
// camelCase Katalog-Typen aus lib/catalog/queries.ts (CatalogFamily/
// CatalogModel), die nach und nach von der Formel in lib/mail/render.ts
// abgewichen war (Prüfung, Befund 3).
//
// Der Kundenflow kennt kein inquiries.vehicle_text (das entsteht erst beim
// Anlegen der Anfrage bzw. im Schnellweg) - immer null, die Signatur bleibt
// dadurch für alle bestehenden Aufrufstellen (CarStep, CategoryStep,
// ContactStep, DoneStep) unverändert (family: CatalogFamily statt
// CatalogFamily | null, kein dritter Parameter).
import { vehicleDisplayLabel } from "@/lib/catalog/vehicle-label";
import type { CatalogFamily, CatalogModel } from "@/lib/catalog/queries";

export function vehicleDisplayName(
  family: CatalogFamily,
  model: CatalogModel | null,
  lineId?: string | null,
): string {
  return vehicleDisplayLabel({ brand: family.brand, name: family.name, codes: family.codes }, model, null, lineId);
}
