// Gemeinsame, reine Formel für die kundensichtbare Fahrzeugbezeichnung, z.B.
// "BMW M2 G87, M2" oder "Wiesmann, MF4". Bisher gab es davon drei fast, aber
// nicht ganz identische Kopien (lib/mail/render.ts vehicleLabel(),
// lib/inquiry/share.ts eigene Inline-Fassung, components/flow/vehicleLabel.ts
// vehicleDisplayName()) - diese Datei ist jetzt die einzige Quelle, alle drei
// Stellen rufen sie auf (siehe dortige Kommentare, Prüfung Punkt 3).
//
// Formel (verbindlich, siehe docs/architektur.md Abschnitt "Design" und
// Aufgabenstellung):
//   1. Familienname NIE weglassen (auch nicht bei den drei Kurzablauf-
//      Platzhalterfamilien "Älteres Modell" usw. - "Ihren BMW Älteres
//      Modell" liest sich holprig, ist aber die vorgegebene Formel, keine
//      Sonderbehandlung für einzelne Namen).
//   2. Marke nicht doppeln: family.name, der bereits mit der Marke beginnt
//      (MINI-Familien, "Wiesmann" als Marke UND Familienname), bekommt die
//      Marke nicht nochmals vorangestellt.
//   3. Kein Anhängen von model_families.codes (frühere Fassung hängte bei
//      genau einem Code-Eintrag einen Baureihen-Code an - das ergab bei
//      mehreren Codes gar keinen Baureihen-Hinweis und bei "3er G20, G21"
//      mit Modell "M40i" einen komplett falschen).
//   4. Modell gewählt -> ", <model.name>" anhängen.
//   5. Kein Modell gewählt, aber ein vehicleText vorhanden (Freitext, z.B.
//      "MF4" bei Wiesmann oder "E46 M3" bei "Älteres Modell" - Familien ohne
//      Modell-Katalog haben sonst keine Möglichkeit, die konkrete
//      Modellbezeichnung festzuhalten) -> ", <vehicleText>" anhängen, exakt
//      wie ein Modellname.
//   6. Weder Modell noch vehicleText -> nur der Familienname.
//   7. Gar keine Familie bekannt (nur beim Schnellweg ohne Katalogtreffer
//      möglich) -> vehicleText allein, sonst leerer String.
//
// Absichtlich denkbar simpel und ohne jede Fallunterscheidung nach
// Familienname/Marke (keine Code-Logik für "ist das eine Platzhalterfamilie"
// o.ä.) - genau das war der Blocker-Befund der Prüfung.

/** Kleinster gemeinsamer Ausschnitt einer Familie, den die Formel braucht. */
export interface VehicleLabelFamily {
  brand: string;
  name: string;
}

/** Kleinster gemeinsamer Ausschnitt eines Modells, den die Formel braucht. */
export interface VehicleLabelModel {
  name: string;
}

function startsWithBrand(text: string, brand: string): boolean {
  return text.toLowerCase().startsWith(brand.toLowerCase());
}

export function vehicleDisplayLabel(params: {
  family: VehicleLabelFamily | null;
  model: VehicleLabelModel | null;
  vehicleText: string | null;
}): string {
  const { family, model, vehicleText } = params;
  const text = vehicleText?.trim() || null;

  if (!family) return text ?? "";

  const familyLabel = startsWithBrand(family.name, family.brand) ? family.name : `${family.brand} ${family.name}`;

  if (model) return `${familyLabel}, ${model.name}`;
  if (text) return `${familyLabel}, ${text}`;
  return familyLabel;
}
