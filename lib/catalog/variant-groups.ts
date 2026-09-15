// Varianten-Gruppen je Flow-Kategorie. Quelle: docs/excel-import.md,
// Abschnitt "Varianten-Gruppen (lib/catalog/variant-groups.ts)".
// Regex auf den Produktnamen, je Flow-Kategorie, in der dokumentierten
// Reihenfolge (erster Treffer gewinnt). Kein Treffer -> null (kombinierbar).
import type { FlowCategory } from "@/lib/pricelist/types";

interface VariantRule {
  pattern: RegExp;
  group: string;
  /** Trifft `exclude` zu, gilt die Regel trotz `pattern`-Treffer als nicht
   * getroffen (siehe motor-Regel unten). */
  exclude?: RegExp;
}

const RULES: Partial<Record<FlowCategory, VariantRule[]>> = {
  motor: [
    {
      pattern: /\(Basis|Stufe\s*\d|Leistungssteigerung/i,
      group: "leistung",
      // Prüfbericht Modul Parser, Befund 2: die Regel matcht wörtlich auch
      // Namen, die keine eigene Leistungsstufe sind und deshalb nicht
      // exklusiv zu Stufe 1/Stufe 2 stehen dürfen:
      // - "Einbau Leistungssteigerung" (17 Familien): reine
      //   Montagepauschale (CHF 330) für eine an anderer Stelle bereits
      //   gewählte Stufe, kein eigenes Leistungsprodukt. Ohne Ausnahme
      //   würde die Auswahl dieser Pauschale die gewählte Stufe abwählen
      //   (und umgekehrt), der PS-Zähler zeigt dann fälschlich "Serie".
      // - "Anhebung der serienmässigen V/max. Begr. auf 327km/h i.V. mit
      //   Leistungssteigerung" (M5 F10/M6 F06): ein Zusatz, der
      //   ausdrücklich in Verbindung mit einer Stufe gekauft wird, selbst
      //   aber keine ist.
      // Bewusst NICHT ausgenommen: "Aufhebung der serienmässigen V/max
      // Begrenzung ohne Leistungssteigerung" (M2 F87, M3/M4 G80) - hier
      // ist Exklusivität zu einer Stufe vertretbar (die Aufhebung ersetzt
      // eine mit Stufe 1/2 mitgelieferte V/max-Aufhebung), deshalb bleibt
      // dieser Name über das allgemeine Muster weiterhin erfasst.
      exclude: /^Einbau\b|i\.V\.\s*mit\s+Leistungssteigerung/i,
    },
    // Rückmeldung aus dem ersten Klicktest (Kundenflow M2 G87), siehe
    // CLAUDE.md Abschnitt "AUFGABE", Punkt 4. Reihenfolge wichtig (erster
    // Treffer gewinnt, siehe variantGroupFor() unten): steht NACH
    // "leistung", damit ein Leistungsstufen-Name mit "Sportluftfilter"/
    // "Air Intake" im Namen (kommt in der Praxis nicht vor, die
    // Aufgabenstellung verlangt die Absicherung trotzdem ausdrücklich: "nur
    // wenn nicht leistung") nicht versehentlich in die ansaugung-Gruppe
    // statt in leistung fällt. "Air Intake" (Carbon Air Intake),
    // "Sportluftfilter" (Satz), "Ansaugsystem": alternative
    // Ansaugungs-Upgrades, exklusiv zueinander (z.B. M2 G87 "Sportluftfilter
    // Satz" vs. "Carbon Air Intake").
    { pattern: /Air Intake|Sportluftfilter|Ansaugsystem/i, group: "ansaugung" },
    // Nachzug Prüfung Phase D, Punkt 2: "Getriebeoptimierung St.1 / 8 HP",
    // "St.2 / 8 HP", "St.3 / 8 HP" (source_category Kraftübertragung, siehe
    // docs/excel-import.md Kategorie-Mapping: Kraftübertragung -> Flow-
    // Kategorie motor) sind drei alternative Programmierstufen desselben
    // Automatgetriebes, exklusiv zueinander - ohne Gruppe waren alle drei
    // gleichzeitig wählbar, obwohl nur eine gleichzeitig installiert sein
    // kann. Kein Konflikt mit "leistung"/"ansaugung" oben (keiner der drei
    // Namen enthält "Stufe"/"(Basis"/"Leistungssteigerung"/"Air Intake"/
    // "Sportluftfilter"/"Ansaugsystem"), Position danach trotzdem konsistent
    // mit der übrigen Liste (spezifischere/spätere Ergänzungen ans Ende).
    { pattern: /Getriebeoptimierung/i, group: "getriebeoptimierung" },
  ],
  auspuff: [
    // Reihenfolge wichtig: "anlage" zuerst, sonst matcht z. B. "Edelstahl
    // Komplettanlage HP ... ohne Endrohre" fälschlich auf "endrohre" (der
    // Name enthält das Wort "Endrohre", ist aber eine Anlage ohne Endrohre).
    { pattern: /Komplettanlage|Endschalld|Nachschalld|Auspuffanlage/i, group: "anlage" },
    { pattern: /Endrohre/i, group: "endrohre" },
    // Nachzug Prüfung Phase D, Punkt 2: "Edelstahl Mittelschalldämpfer"/
    // "... HP" vs. "Edelstahl H-Pipe Ersatz Mittelschalldämpfer"/"Edelstahl
    // X-Rohr Ersatz Mittelschalldämpfer" sind alternative Mittelschall-
    // dämpfer-Ausführungen (Serienersatz vs. freier durchlassendes H-Pipe-/
    // X-Rohr-Ersatzrohr), exklusiv zueinander - keiner davon ist eine
    // "Komplettanlage" (bleibt über die anlage-Regel oben, die zuerst
    // geprüft wird, unverändert eigenständig gruppiert). Muster deckt auch
    // "X-Pipe" ab (in den 42 Preislisten kommt nur "X-Rohr" vor, die
    // Aufgabenstellung verlangt "X-Pipe" trotzdem ausdrücklich mit).
    { pattern: /Mittelschalld|H-Pipe|X-Rohr|X-Pipe/i, group: "mittelschalldaempfer" },
  ],
  fahrwerk: [
    {
      pattern: /Sportfeder|Sportfahrwerk|Gewindefahrwerk|Performance Fahrwerk|Race Fahrwerk/i,
      group: "fahrwerk",
    },
  ],
  raeder: [{ pattern: /Radsatz/i, group: "radsatz" }],
  exterieur: [
    {
      // "(^|dÄHLer )Frontgrill(?!.*unten)": "Frontgrill Carbon" und
      // "Frontgrill CS Carbon" sind exklusiv zueinander (dieselbe Öffnung,
      // unterschiedliche Ausführung); "Frontgrill Carbon gross / unten"
      // bleibt über die Ausnahme kombinierbar (ein zusätzliches, unteres
      // Element, kein Ersatz für den oberen Grill). "^M Niere"/"Niere"
      // (ohne Anker) erfasst zusätzlich die BMW-Nieren-Varianten ("dÄHLer
      // Niere M Doppelsteg schwarz glanz" vs. "dÄHLer Niere schwarz glanz",
      // 3er G20/G21): dieselbe Öffnung, unterschiedliche Ausführung,
      // ebenfalls exklusiv.
      //
      // Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 4): der reine
      // Anfangs-Anker "^Frontgrill" griff bei 1er F40 nicht - "dÄHLer
      // Frontgrill Diamont schwarz glanz" und "dÄHLer Frontgrill doppelsteg
      // schwarz glanz" (gleiche Modelle, je CHF 430) fingen ohne Gruppe an
      // und blieben gemeinsam wählbar, exakt das vom Kunden gemeldete
      // Problem (zwei Grills gleichzeitig). Anker um die "dÄHLer "-Marke
      // erweitert ("^" ODER "dÄHLer " direkt davor), das Negativ-Lookahead
      // auf "unten" bleibt unverändert wirksam.
      pattern: /(^|dÄHLer )Frontgrill(?!.*unten)|^M Niere|Niere/i,
      group: "frontgrill",
    },
    // "Heckdif+usor" (Regex-Vorgabe der Aufgabenstellung) deckt nur die
    // KORREKTE Schreibweise "Heckdiffusor" (doppeltes f) ab. Die tatsächliche
    // Excel-Schreibweise in allen 42 Preislisten ist "Heckdifussor" (EIN f,
    // doppeltes s statt "Heckdiffusor") - siehe z.B. M2 G87 "Heckdifussor
    // Carbon"/"Heckdifussor Race Carbon" (docs/excel-import.md nicht
    // gesondert dokumentiert, per Stichprobe geprüft). "Heckdif+us+or"
    // (f einmal oder mehrfach, s einmal oder mehrfach) trifft beide
    // Schreibweisen ("Heckdiffusor" und "Heckdifussor"), ohne die
    // dokumentierte Absicht (Heckdiffusor-Varianten exklusiv) zu verfehlen.
    { pattern: /Heckdif+us+or/i, group: "heckdiffusor" },
    {
      pattern: /Frontspoiler|Frontlippe/i,
      group: "frontspoiler",
      // Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 5): M2 F87 hatte
      // alle vier Frontspoiler-Produkte in EINER Exklusivgruppe, obwohl
      // "Frontspoilerlippe i.V. mit Frontspoiler mittig" laut eigenem Namen
      // die Kombination mit genau "Frontspoiler mittig" voraussetzt (kein
      // Ersatz dafür) und "Frontspoiler Flaps seitlich" eine Ergänzung ist,
      // kein Ersatz für eine Lippe/einen Spoiler. Namen mit "i.V. mit"/"in
      // Verbindung mit"/"in Verb. mit" (ausdrücklich in Kombination mit
      // einem anderen Produkt gedacht, gleiche Begründung wie die
      // motor-Ausnahme "i.V. mit Leistungssteigerung" oben) oder "Flaps"
      // (eine Ergänzung, keine Alternative) bleiben deshalb ausserhalb
      // dieser Gruppe kombinierbar.
      exclude: /i\.V\.\s*mit|in Verb(?:indung|\.)\s*mit|Flaps/i,
    },
    { pattern: /Heckspoiler|Heckflügel/i, group: "heckspoiler" },
    { pattern: /Motorhaube/i, group: "motorhaube" },
  ],
  interieur: [
    {
      pattern: /Lenkrad/i,
      group: "lenkrad",
      // Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 3): /Lenkrad/i
      // allein matcht auch "Abgasklappensteuerung bedienbar über
      // Lenkradtaste (oder Fernbedienung)" (18 aktive Produkte, ca. 20
      // Familien) und "Farblich abgestimmte Steppnähte und
      // Lenkrad-Griffbereich in Alcantara" (M5 F10) - beides keine
      // Lenkrad-ALTERNATIVEN zum Sportlenkrad, sondern ein Bedienweg für
      // eine andere Funktion bzw. eine Ausstattungsdetail-Kombination.
      // Wählte der Kunde das Sportlenkrad, wurde die Abgasklappensteuerung
      // fälschlich abgewählt und umgekehrt. Diese beiden Namen bleiben über
      // die Ausnahme ausserhalb der Gruppe.
      exclude: /Lenkradtaste|Griffbereich/i,
    },
  ],
};

/** Ermittelt die variant_group für ein Produkt (Optionen derselben Gruppe schliessen sich im Flow aus). */
export function variantGroupFor(category: FlowCategory, name: string): string | null {
  const rules = RULES[category];
  if (!rules) return null;
  for (const rule of rules) {
    if (rule.pattern.test(name) && !(rule.exclude && rule.exclude.test(name))) return rule.group;
  }
  return null;
}
