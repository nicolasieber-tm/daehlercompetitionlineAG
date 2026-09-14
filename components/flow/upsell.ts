// "Passt gut dazu"-Zuordnung je Kategorie, siehe docs/vorschau.html (const
// UPSELL) und CLAUDE.md Abschnitt "Kundenflow": "«Passt gut dazu»-Vorschlag
// für eine nicht gewählte Kategorie, ein Klick fügt sie als nächsten Schritt
// ein." lib/catalog/upsell.ts (siehe docs/architektur.md) existiert nicht
// (nicht Teil der zugewiesenen Dateien dieser Aufgabe); die Zuordnung selbst
// ist reine Flow-UI-Logik (keine Katalogdaten) und liegt deshalb hier. Die
// Texte (Titel/Beschreibung) kommen aus lib/i18n de.ts/en.ts
// (steps.category.upsell.<kategorie>), diese Datei liefert nur, WELCHE
// Zielkategorie vorgeschlagen wird.
import type { FlowCategory } from "@/lib/supabase/rows";

export const UPSELL_TARGET: Record<FlowCategory, FlowCategory> = {
  motor: "auspuff",
  auspuff: "motor",
  fahrwerk: "raeder",
  raeder: "fahrwerk",
  exterieur: "interieur",
  interieur: "exterieur",
};
