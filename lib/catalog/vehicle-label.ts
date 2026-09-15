// Gemeinsame, reine Formel für die kundensichtbare Fahrzeugbezeichnung.
// Siehe docs/architektur.md, Abschnitt "Fahrzeugbezeichnung" (Stand
// 15.09.2026) - dort stehen die fünf Regeln mit Beispielen, diese Datei
// setzt sie um. Auslöser: Kundenrückmeldung "BMW M2 G87, M2 liest sich
// doppelt" - die alte Formel hängte das Modell einfach mit Komma an den
// vollen Familiennamen (der die Codes noch als Text enthielt) an. Die neue
// Formel entfernt die Codes aus der Familienzeile (die "Linie"), setzt sie
// stattdessen in Klammern ans Ende, und verschmilzt Linie und Modellname zu
// einem einzigen, nicht-redundanten Satz statt zweier Kommaglieder.
//
// Fünf Regeln (siehe docs/architektur.md für die vollständige Fassung mit
// Beispielen):
//   1. Linie = Familienname ohne Codes, ohne Trennzeichen-Reste. Enthält die
//      Linie Alternativen ("/" oder ","), wird die Alternative gewählt, die
//      die meisten Wörter mit der Motorisierung teilt (ohne Leerzeichen,
//      ohne Gross/Klein verglichen: "X3M" = "X3 M") - bei Gleichstand (auch
//      0) die erste Alternative.
//   2. Motorisierung: Wörter, die schon (exakt, als eigenes Wort) in der
//      gewählten Linie stehen, werden weggelassen, der Rest angehängt. Sind
//      Linie und Motorisierung nach Entfernen der Leerzeichen identisch
//      (z.B. Linie "X3M", Motorisierung "X3 M"), wird die Schreibweise der
//      Motorisierung übernommen (besser lesbar als die Baureihen-Kurzform).
//   3. Codes in Klammern ans Ende, wenn vorhanden. Besteht der Familienname
//      aus Alternativ-Segmenten, die jeweils ihre EIGENEN Codes im Text
//      tragen (z.B. "8er G14, G15, G16 / M8 F91, F92, F93"), gehören nur die
//      Codes der GEWÄHLTEN Alternative in die Klammer ("BMW M8 (F91, F92,
//      F93)"), nicht die Codes der anderen Alternative(n). Hat die gewählte
//      Alternative keine eigenen Codes (kein Code-Token folgt ihr direkt vor
//      der nächsten Alternative, z.B. "M3" in "M3 / M4 G80, G81, G82, G83"),
//      gelten ersatzweise alle Codes der Familie ("BMW M3 Touring (G80,
//      G81, G82, G83)"). Enthält die Motorisierung selbst bereits eine
//      Klammer (z.B. "Countryman One (Benzin)"), werden deren Inhalt und die
//      Codes zu EINER Klammer zusammengeführt ("MINI Countryman One
//      (Benzin, F60)") statt zwei Klammern hintereinander. Korrektur
//      15.09.2026 (Feinschliff-Prüfung): vorher bekam JEDE Alternative alle
//      Codes der Familie, siehe analyzeFamily()-Kommentar unten für den
//      Hintergrund des X5M/X6M-Befunds, den das schon einmal betraf.
//   4. Ohne Modell (Kurzablauf/Platzhalter): mit vehicleText -> Marke +
//      vehicleText (die Linie wird hier bewusst NICHT gezeigt - "Wiesmann,
//      MF4" oder "BMW Älteres Modell, E46 M3" liest sich genauso doppelt/
//      unnötig wie der ursprüngliche Kundenbefund). Ohne vehicleText -> die
//      Familienzeile allein (vehicleFamilyLine()).
//   5. Intern zusätzlich vehicleInternalLine() (Baureihe/Motorisierung roh,
//      für den Preislisten-Abgleich bei dÄHLer).
//
// Ersetzt drei vorher fast, aber nicht ganz identische Kopien (lib/mail/
// render.ts vehicleLabel(), lib/inquiry/share.ts, components/flow/
// vehicleLabel.ts) - diese Datei ist die einzige Quelle, die anderen rufen
// sie auf.

/** Kleinster gemeinsamer Ausschnitt einer Familie, den die Formel braucht. */
export interface VehicleLabelFamily {
  brand: string;
  name: string;
  /** model_families.codes, z.B. ["G20", "G21"]. Fehlt/leer -> Codes werden aus dem Namen erkannt (siehe CODE_TOKEN_RE unten). */
  codes?: string[] | null;
  /** Nicht Teil der Formel selbst (kein Fall unterscheidet danach), Teil der Signatur für Aufrufer, die die volle Familien-Row durchreichen. */
  has_pricelist?: boolean;
}

/** Kleinster gemeinsamer Ausschnitt eines Modells, den die Formel braucht. */
export interface VehicleLabelModel {
  name: string;
}

// --- Codes erkennen/entfernen, je Alternativ-Segment -----------------------

// Baureihen-Codes aus dem Import: ein Buchstabe aus E/F/G/U/R plus 2-3
// Ziffern (E46, F87, G87, U06, R107), oder "NA" plus eine Ziffer (NA5, für
// Modelle ohne klassischen BMW-internen Code, z.B. iX3).
const CODE_TOKEN_RE = /^(?:[EFGUR]\d{2,3}|NA\d)$/i;

// Tokenisiert eine Familienzeile in Wörter und die dazwischenliegenden
// Trennzeichen (Leerzeichen, "/", ","), damit analyzeFamily() Wort-Tokens
// gezielt klassifizieren (Code oder Name-Wort) und die Trennzeichen
// anschliessend aufräumen kann, ohne mit einer einzigen grossen Regex zu
// hantieren.
const TOKENIZE_RE = /[^\s,/]+|[\s,/]+/g;

function isSeparatorToken(token: string): boolean {
  return /^[\s,/]+$/.test(token);
}

/** Ein Alternativ-Segment eines Familiennamens: sein Name-Teil (ohne Codes,
 * mehrere Wörter möglich, z.B. "M2 Competition") und die Codes, die im Text
 * direkt (durch Leerzeichen, "," oder "/" getrennt) auf dieses Segment
 * folgen, bevor das nächste Alternativ-Segment beginnt. */
interface FamilySegment {
  name: string;
  codes: string[];
}

/**
 * Zerlegt den rohen Familiennamen in seine Alternativ-Segmente (Regel 3).
 * Ein neues Segment beginnt an einem Name-Wort (kein Code-Token) NUR, wenn
 * das Trennzeichen direkt davor ein "," oder "/" enthält - reines
 * Leerzeichen verlängert stattdessen den (mehrwortigen) Namen des aktuellen
 * Segments weiter (z.B. "M2 Competition", oder "MINI F60 Countryman": "F60"
 * ist dort ein Code MITTEN im Namen, kein Alternativ-Trenner, das folgende
 * "Countryman" gehört weiterhin zum selben, einzigen Segment). Ein
 * Code-Token gehört immer zum GERADE OFFENEN Segment, unabhängig vom
 * Trennzeichen davor (Kommas trennen innerhalb einer Codes-Liste genauso
 * wie zwischen zwei Alternativen - "M5 F10, M6 F06, F12, F13": das Komma vor
 * "M6" trennt Alternativen, die beiden Kommas danach nur die Codes-Liste
 * von M6 - unterscheidbar einzig daran, ob auf das Komma ein Code- oder ein
 * Name-Wort folgt). Ein Code, dem direkt ein "LCI"-Token folgt
 * (Facelift-Kennzeichnung, "F95 LCI" oder "F95/LCI"), dokumentiert nur, dass
 * der Code auch die Facelift-Version abdeckt (BMW behält den Chassis-Code
 * über die Modellpflege hinweg) - "LCI" wird darum komplett entfernt (wie
 * das Trennzeichen davor), taucht weder im Namen noch in der Klammer auf.
 * Ein Modell, das die Facelift-Version tatsächlich bezeichnet (Motorisierung
 * "X5M LCI"), bekommt sein "LCI" stattdessen über appendMotorisierung() aus
 * der Motorisierung selbst - sonst würden Vorfacelift- und Facelift-Modell
 * derselben Familie (z.B. "X5M" und "X5M LCI") auf dieselbe Bezeichnung
 * fallen (Prüf-Befund 15.09.2026: beide ergaben "BMW X5M (F95 LCI, F96
 * LCI)").
 */
function analyzeFamily(
  name: string,
  explicitCodes: string[] | null | undefined,
): { segments: FamilySegment[]; explicitList: string[] | null } {
  const explicitList = explicitCodes && explicitCodes.length > 0 ? explicitCodes.map((c) => c.trim()) : null;
  const explicitSet = explicitList ? new Set(explicitList.map((c) => c.toUpperCase())) : null;
  const isCode = (token: string): boolean =>
    explicitSet ? explicitSet.has(token.toUpperCase()) : CODE_TOKEN_RE.test(token);

  const tokens = name.match(TOKENIZE_RE) ?? [];
  const segments: FamilySegment[] = [];
  let nameWords: string[] = [];
  let codes: string[] = [];
  // Trennzeichen unmittelbar vor dem nächsten Token enthält "," oder "/"?
  let sepHasCommaOrSlash = false;

  const flush = (): void => {
    if (nameWords.length === 0 && codes.length === 0) return;
    segments.push({ name: nameWords.join(" "), codes });
    nameWords = [];
    codes = [];
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isSeparatorToken(token)) {
      sepHasCommaOrSlash = /[,/]/.test(token);
      continue;
    }
    if (isCode(token)) {
      codes.push(token);
      // Optional direkt gefolgt von "LCI" (durch Leerzeichen oder "/"
      // getrennt) - siehe Kommentar oben.
      let lookahead = i + 1;
      if (lookahead < tokens.length && isSeparatorToken(tokens[lookahead])) lookahead += 1;
      if (lookahead < tokens.length && /^LCI$/i.test(tokens[lookahead])) {
        i = lookahead;
      }
      sepHasCommaOrSlash = false;
      continue;
    }
    // Name-Wort: neues Segment nur nach einem "," oder "/" - reines
    // Leerzeichen verlängert den Namen des aktuellen Segments.
    if (nameWords.length > 0 && sepHasCommaOrSlash) flush();
    nameWords.push(token);
    sepHasCommaOrSlash = false;
  }
  flush();

  return { segments, explicitList };
}

/**
 * Codes für die Klammer (Regel 3): bei genau einem Segment (keine
 * Alternativen) die explizite Liste unverändert (falls vorhanden - deckt
 * Fälle ab, in denen ein Code gar nicht im Namenstext auftaucht, z.B. "iX3"
 * mit codes ["NA5"]), sonst die im Text gefundenen Codes des Segments. Bei
 * mehreren Segmenten (Alternativen): die eigenen Codes des gewählten
 * Segments - hat es keine, ersatzweise alle Codes aller Segmente
 * (Fundreihenfolge, ohne Duplikate).
 */
function resolveCodes(segments: FamilySegment[], chosenIndex: number, explicitList: string[] | null): string[] {
  if (segments.length <= 1) return explicitList ?? segments[0]?.codes ?? [];

  const chosen = segments[chosenIndex];
  if (chosen && chosen.codes.length > 0) return chosen.codes;

  // Kein Segment hat im Text überhaupt Codes gefunden (z.B. "M3 / M4" mit
  // codes[] nur als separates DB-Feld, nicht im Namenstext eingebettet) -
  // die Alternativen tragen dann schlicht keine eigenen Codes im Text,
  // Regel 3 greift wie im Ein-Segment-Fall: die explizite Liste unverändert.
  const totalFound = segments.reduce((n, s) => n + s.codes.length, 0);
  if (totalFound === 0) return explicitList ?? [];

  const seen = new Set<string>();
  const all: string[] = [];
  for (const segment of segments) {
    for (const code of segment.codes) {
      const key = code.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(code);
    }
  }
  return all;
}

function normalizeCompact(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/**
 * Wörter einer Motorisierung, getrennt durch Leerzeichen ODER "/" - manche
 * Modellnamen aus dem Import trennen ohne Leerzeichen ("M3/Comp.",
 * "M4/Comp.", siehe scratchpad-Bericht); ohne die "/"-Trennung würde
 * "M3/Comp." als EIN Wort behandelt, das weder mit "M3" noch mit "M4"
 * übereinstimmt, und dann fälschlich immer die erste Alternative gewinnen.
 */
function motorisierungWords(motorisierung: string): string[] {
  return motorisierung.split(/[\s/]+/).filter(Boolean);
}

/** Anzahl Wörter der Motorisierung, die im (leerzeichenfrei verglichenen) Segmentnamen vorkommen - siehe Regel 1, "X3M" = "X3 M". */
function sharedWordScore(segmentName: string, motorisierung: string): number {
  const nameCompact = normalizeCompact(segmentName);
  let score = 0;
  for (const word of motorisierungWords(motorisierung)) {
    if (nameCompact.includes(normalizeCompact(word))) score += 1;
  }
  return score;
}

/** Wählt den Index des Segments mit dem höchsten sharedWordScore; bei Gleichstand (auch 0) das erste. */
function chooseSegmentIndex(segments: FamilySegment[], motorisierung: string | null): number {
  if (segments.length <= 1 || !motorisierung) return 0;

  let bestIndex = 0;
  let bestScore = sharedWordScore(segments[0].name, motorisierung);
  for (let i = 1; i < segments.length; i++) {
    const score = sharedWordScore(segments[i].name, motorisierung);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * true, wenn die Formel die Alternative NICHT auflösen kann: die Linie
 * besteht aus mehreren Segmenten (z.B. eine Baureihe, die sowohl X1 als
 * auch X2 umfasst), und die Motorisierung teilt mit KEINEM davon auch nur
 * ein Wort (z.B. eine reine Motorbezeichnung wie "20d", die es für beide
 * Modelle gibt). chooseSegmentIndex() wählt in diesem Fall stillschweigend
 * das erste Segment (Regel 1, "bei Gleichstand auch 0 die erste
 * Alternative") - technisch korrekt, aber ohne Grundlage, WELCHES der
 * beiden Modelle der Kunde tatsächlich hat. Ergänzung 15.09.2026
 * (Feinschliff-Prüfung, Ambiguität X1/X2, X3/X4, X5/X6): lib/rules/
 * checks.ts nutzt dies für den Prüfhinweis "modell_mehrdeutig", siehe
 * docs/architektur.md Abschnitt "Fahrzeugbezeichnung".
 */
export function vehicleLineIsAmbiguous(family: VehicleLabelFamily, model: VehicleLabelModel): boolean {
  const { segments } = analyzeFamily(family.name, family.codes);
  if (segments.length <= 1) return false;
  return segments.every((segment) => sharedWordScore(segment.name, model.name) === 0);
}

// --- Motorisierung anhängen (Regel 2) ---------------------------------------

/**
 * Hängt die Motorisierung an die (bereits per chooseSegmentIndex gewählte)
 * Linie an: bereits als eigenes Wort vorhandene Wörter werden weggelassen,
 * der Rest angehängt. Sind Linie und Motorisierung leerzeichenfrei
 * identisch (z.B. "X3M" und "X3 M"), wird die - besser lesbare -
 * Schreibweise der Motorisierung übernommen statt der Baureihen-Kurzform.
 *
 * Prüft nur gegen Wörter der gewählten Linie, NICHT gegen die Codes/Klammer
 * (siehe analyzeFamily(): "LCI" steht dort nicht mehr, ein Modell "X5M LCI"
 * muss sein "LCI" also aus der Motorisierung selbst bekommen, damit es sich
 * von einem Vorfacelift-Modell "X5M" derselben Familie unterscheidet).
 */
function appendMotorisierung(line: string, motorisierung: string): string {
  if (normalizeCompact(line) === normalizeCompact(motorisierung)) return motorisierung;

  const lineWords = new Set(line.toLowerCase().split(/\s+/).filter(Boolean));
  const isKnown = (word: string) => lineWords.has(word.toLowerCase());

  // Tokenisiert wie analyzeFamily() (Wörter und die Trennzeichen dazwischen,
  // hier "/" statt "," - Motorisierungen haben keine Code-Listen), damit
  // "M3/Comp." mit entferntem "M3" zu "Comp." wird statt zu "/Comp." oder
  // " Comp." (Trennzeichen-Reste, analog Regel 1).
  const tokens = motorisierung.match(/[^\s/]+|[\s/]+/g) ?? [];
  const kept = tokens.map((token) => (isSeparatorToken(token) || !isKnown(token) ? token : ""));
  let remaining = kept.join("");
  remaining = remaining.replace(/\s*\/\s*/g, " / ").replace(/\s{2,}/g, " ");
  remaining = remaining.replace(/^[\s/]+/, "").replace(/[\s/]+$/, "");

  return [line, remaining].filter(Boolean).join(" ");
}

// --- Marke nicht doppeln -----------------------------------------------------

/** Setzt die Marke (in korrekter Schreibweise aus family.brand) vor die Linie, ohne sie zu doppeln, wenn die Linie schon mit ihr beginnt (auch bei abweichender Schreibweise wie "TOYOTA" statt "Toyota"). */
function prependBrand(line: string, brand: string): string {
  const brandLower = brand.toLowerCase();
  const lineLower = line.toLowerCase();
  if (lineLower === brandLower) return brand;
  if (lineLower.startsWith(`${brandLower} `)) return `${brand}${line.slice(brand.length)}`;
  return line ? `${brand} ${line}` : brand;
}

/**
 * Entfernt das Markenwort als eigenes Wort aus JEDER Position der Linie,
 * nicht nur am Anfang (anders als prependBrand()s eigene, einfachere
 * Dublettenprüfung) - für von Hand gepflegte Familiennamen, die die Marke
 * mitten im Namen tragen, z.B. "Älteres MINI-Modell" (Markenwort nach einem
 * Bindestrich statt am Anfang). Nur für vehicleFamilyLine() (Regel 4 ohne
 * Modell): dort ist die Linie der einzige Text, den der Kunde sieht, und
 * prependBrand() setzt die Marke ohnehin danach wieder sauber davor.
 * Ergänzung 15.09.2026 (Feinschliff-Prüfung, Platzhalter-Familien): die
 * Seed-Namen selbst heissen jetzt einheitlich "Älteres Modell"/"Anderes
 * Modell" ohne Markenwort, dieser Schutz greift nur noch bei künftig von
 * Hand nachgetragenen Namen, die die Marke wieder mit einbauen.
 */
function stripBrandWord(line: string, brand: string): string {
  const trimmedBrand = brand.trim();
  if (!trimmedBrand) return line;
  const escaped = trimmedBrand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Trennzeichen (Leerzeichen, ",", "/", "-") direkt vor und nach dem
  // Markenwort werden mitentfernt, sonst bliebe z.B. aus "Älteres
  // MINI-Modell" ein Rest "Älteres -Modell" stehen statt "Älteres Modell".
  const re = new RegExp(`(^|[\\s,/-])${escaped}(?=$|[\\s,/-])[\\s,/-]?`, "gi");
  const stripped = line.replace(re, "$1");
  return stripped.replace(/\s{2,}/g, " ").replace(/^[\s,/-]+/, "").replace(/[\s,/-]+$/, "").trim();
}

/**
 * Hängt die Codes in EINER Klammer an - verschmilzt sie mit einer bereits in
 * der Linie vorhandenen, abschliessenden Klammer statt eine zweite
 * anzuhängen. Die Motorisierung selbst kann eine Klammer enthalten (z.B.
 * "Countryman One (Benzin)", "Cooper SE (Electric)" - Kraftstoffart aus dem
 * Excel-Namen, siehe lib/catalog Import); appendMotorisierung() gibt diese
 * Klammer unverändert als Teil der Linie weiter. Ohne appendCodes() würden
 * codes hier einfach eine ZWEITE Klammer anhängen ("... One (Benzin)
 * (F60)") - Feinschliff-Befund 15.09.2026 ("Doppelklammern"). Merge statt
 * Anhängen: "... One (Benzin, F60)".
 */
function appendCodes(line: string, codes: string[]): string {
  const trailingParen = /^(.*)\s\(([^()]*)\)$/.exec(line);
  if (trailingParen) {
    const [, base, inner] = trailingParen;
    const parts = [inner, ...codes].map((p) => p.trim()).filter(Boolean);
    return parts.length > 0 ? `${base} (${parts.join(", ")})` : base;
  }
  return codes.length > 0 ? `${line} (${codes.join(", ")})` : line;
}

// --- Öffentliche Formel -------------------------------------------------------

/**
 * Familienzeile allein (Marke + Linie, Codes in Klammern): "MINI Cooper S
 * JCW (F55, F56, F57)", "BMW Älteres Modell" (keine Codes -> keine Klammer).
 * Ohne Motorisierung gibt es nichts, wonach eine Alternative ausgewählt
 * werden könnte - bei mehreren Alternativen gilt hier immer die erste
 * (Regel 1, "teilt keine ein Wort, gilt die erste Alternative").
 */
export function vehicleFamilyLine(family: VehicleLabelFamily): string {
  const { segments, explicitList } = analyzeFamily(family.name, family.codes);
  const chosenIndex = chooseSegmentIndex(segments, null);
  const codes = resolveCodes(segments, chosenIndex, explicitList);
  const chosenName = stripBrandWord(segments[chosenIndex]?.name ?? "", family.brand);
  const withBrand = prependBrand(chosenName, family.brand);
  return appendCodes(withBrand, codes);
}

/**
 * Kundensichtbare Fahrzeugbezeichnung, siehe docs/architektur.md Abschnitt
 * "Fahrzeugbezeichnung" für die fünf Regeln mit Beispielen. `family` null
 * (nur beim Schnellweg ohne Katalogtreffer möglich) -> vehicleText allein,
 * sonst leerer String.
 */
export function vehicleDisplayLabel(
  family: VehicleLabelFamily | null,
  model: VehicleLabelModel | null,
  vehicleText: string | null,
): string {
  const text = vehicleText?.trim() || null;

  if (!family) return text ?? "";

  // Regel 4: ohne Modell (Kurzablauf/Platzhalter).
  if (!model) {
    if (text) return prependBrand(text, family.brand);
    return vehicleFamilyLine(family);
  }

  // Regel 1-3: mit Modell.
  const { segments, explicitList } = analyzeFamily(family.name, family.codes);
  const chosenIndex = chooseSegmentIndex(segments, model.name);
  const codes = resolveCodes(segments, chosenIndex, explicitList);
  const chosenLine = segments[chosenIndex]?.name ?? "";
  const withMotorisierung = appendMotorisierung(chosenLine, model.name);
  const withBrand = prependBrand(withMotorisierung, family.brand);
  return appendCodes(withBrand, codes);
}

/**
 * Interne Zeile für Anfrage-Mail/Admin-Detail/Zusammenfassung (Regel 5):
 * "Baureihe: M2 G87 · Motorisierung: M2" - roh, ohne die Aufbereitung von
 * vehicleDisplayLabel(), damit dÄHLer die Preisliste (die nach dem rohen
 * Familiennamen benannt ist) sofort zuordnen kann. Ohne Modell (Kurzablauf)
 * bleibt die Motorisierung weg statt eines leeren/erfundenen Werts.
 */
export function vehicleInternalLine(
  family: Pick<VehicleLabelFamily, "name">,
  model: VehicleLabelModel | null,
): string {
  return model ? `Baureihe: ${family.name} · Motorisierung: ${model.name}` : `Baureihe: ${family.name}`;
}
