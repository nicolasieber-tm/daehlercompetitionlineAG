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
//   3. Codes in Klammern ans Ende, wenn vorhanden.
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

// --- Codes erkennen/entfernen -----------------------------------------------

// Baureihen-Codes aus dem Import: ein Buchstabe aus E/F/G/U/R plus 2-3
// Ziffern (E46, F87, G87, U06, R107), oder "NA" plus eine Ziffer (NA5, für
// Modelle ohne klassischen BMW-internen Code, z.B. iX3).
const CODE_TOKEN_RE = /^(?:[EFGUR]\d{2,3}|NA\d)$/i;

// Tokenisiert eine Familienzeile in Wörter und die dazwischenliegenden
// Trennzeichen (Leerzeichen, "/", ","), damit removeCodes() Wort-Tokens
// gezielt entfernen und die Trennzeichen anschliessend aufräumen kann, ohne
// mit einer einzigen grossen Regex hantieren zu müssen.
const TOKENIZE_RE = /[^\s,/]+|[\s,/]+/g;

function isSeparatorToken(token: string): boolean {
  return /^[\s,/]+$/.test(token);
}

/**
 * Entfernt Code-Tokens (aus family.codes, sonst per CODE_TOKEN_RE erkannt)
 * aus dem Familiennamen, räumt die dadurch entstehenden Trennzeichen-Reste
 * auf (Regel 1: "ohne Trennzeichen-Reste") und sammelt die gefundenen Codes
 * für die Klammer am Ende (Regel 3). Ein Code, dem direkt ein "LCI"-Token
 * folgt (Facelift-Kennzeichnung, z.B. "F95 LCI" oder "F95/LCI"), dokumentiert
 * nur, dass der Code auch die Facelift-Version abdeckt (BMW behält den
 * Chassis-Code über die Modellpflege hinweg) - "LCI" wird darum komplett
 * entfernt (wie das Trennzeichen davor), taucht weder als Wort der Linie
 * noch als Zusatz in der Klammer auf. Ein Modell, das die Facelift-Version
 * tatsächlich bezeichnet (z.B. Motorisierung "X5M LCI"), bekommt sein "LCI"
 * stattdessen über appendMotorisierung() aus der Motorisierung selbst -
 * sonst würden ein Vorfacelift- und ein Facelift-Modell derselben Familie
 * (z.B. "X5M" und "X5M LCI") auf dieselbe Bezeichnung fallen (Prüf-Befund
 * 15.09.2026: beide ergaben "BMW X5M (F95 LCI, F96 LCI)").
 */
function removeCodes(name: string, explicitCodes: string[] | null | undefined): { line: string; codes: string[] } {
  const explicitList = explicitCodes && explicitCodes.length > 0 ? explicitCodes.map((c) => c.trim()) : null;
  const explicitSet = explicitList ? new Set(explicitList.map((c) => c.toUpperCase())) : null;
  const isCode = (token: string): boolean =>
    explicitSet ? explicitSet.has(token.toUpperCase()) : CODE_TOKEN_RE.test(token);

  const tokens = name.match(TOKENIZE_RE) ?? [];
  const out: string[] = [];
  // Automatisch erkannte Codes (kein explicitCodes übergeben): Basisform
  // (gross, für Duplikaterkennung) -> im Namenstext gefundene Original-
  // Schreibweise, in Fundreihenfolge.
  const foundKeys = new Set<string>();
  const foundOrder: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (isSeparatorToken(token)) {
      out.push(token);
      continue;
    }
    if (!isCode(token)) {
      out.push(token);
      continue;
    }
    const key = token.toUpperCase();
    if (!foundKeys.has(key)) {
      foundKeys.add(key);
      foundOrder.push(token);
    }
    // Code-Token entfernt (trägt nichts zur Linie bei): optional direkt
    // gefolgt von "LCI" (durch Leerzeichen oder "/" getrennt) - dann auch
    // das Trennzeichen und das "LCI"-Token mitentfernen (siehe Kommentar
    // oben).
    let lookahead = i + 1;
    if (lookahead < tokens.length && isSeparatorToken(tokens[lookahead])) lookahead += 1;
    if (lookahead < tokens.length && /^LCI$/i.test(tokens[lookahead])) {
      i = lookahead;
    }
  }

  // codes für die Klammer: explizite Liste (in ihrer Reihenfolge) - sonst
  // die automatisch erkannten Codes in Fundreihenfolge.
  const codes = explicitList ?? foundOrder;

  let line = out.join("");
  line = line.replace(/\s*\/\s*/g, " / "); // Schrägstrich-Abstände vereinheitlichen
  line = line.replace(/\s+,/g, ","); // Leerzeichen vor Komma entfernen (Rest einer entfernten Codes-Liste)
  line = line.replace(/\s{2,}/g, " "); // mehrfache Leerzeichen zusammenfassen
  line = line.replace(/^[\s,/]+/, "").replace(/[\s,/]+$/, ""); // führende/schliessende Trennzeichen-Reste
  line = line.replace(/,(?:\s*,)+/g, ","); // doppelte Kommas (beide Nachbar-Codes entfernt)
  line = line.replace(/\/(?:\s*\/)+/g, "/"); // doppelte Schrägstriche

  return { line: line.trim(), codes };
}

// --- Alternativen (Regel 1) --------------------------------------------------

function splitAlternatives(line: string): string[] {
  return line
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter(Boolean);
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

/** Anzahl Wörter der Motorisierung, die in der (leerzeichenfrei verglichenen) Alternative vorkommen - siehe Regel 1, "X3M" = "X3 M". */
function sharedWordScore(alternative: string, motorisierung: string): number {
  const altCompact = normalizeCompact(alternative);
  let score = 0;
  for (const word of motorisierungWords(motorisierung)) {
    if (altCompact.includes(normalizeCompact(word))) score += 1;
  }
  return score;
}

/** Wählt die Alternative mit dem höchsten sharedWordScore; bei Gleichstand (auch 0) die erste. */
function chooseAlternative(line: string, motorisierung: string | null): string {
  const alternatives = splitAlternatives(line);
  if (alternatives.length <= 1) return line;
  if (!motorisierung) return alternatives[0];

  let best = alternatives[0];
  let bestScore = sharedWordScore(alternatives[0], motorisierung);
  for (const alt of alternatives.slice(1)) {
    const score = sharedWordScore(alt, motorisierung);
    if (score > bestScore) {
      best = alt;
      bestScore = score;
    }
  }
  return best;
}

// --- Motorisierung anhängen (Regel 2) ---------------------------------------

/**
 * Hängt die Motorisierung an die (bereits per chooseAlternative gewählte)
 * Linie an: bereits als eigenes Wort vorhandene Wörter werden weggelassen,
 * der Rest angehängt. Sind Linie und Motorisierung leerzeichenfrei
 * identisch (z.B. "X3M" und "X3 M"), wird die - besser lesbare -
 * Schreibweise der Motorisierung übernommen statt der Baureihen-Kurzform.
 *
 * Prüft nur gegen Wörter der gewählten Linie, NICHT gegen die Codes/Klammer
 * (siehe removeCodes(): "LCI" steht dort nicht mehr, ein Modell "X5M LCI"
 * muss sein "LCI" also aus der Motorisierung selbst bekommen, damit es sich
 * von einem Vorfacelift-Modell "X5M" derselben Familie unterscheidet).
 */
function appendMotorisierung(line: string, motorisierung: string): string {
  if (normalizeCompact(line) === normalizeCompact(motorisierung)) return motorisierung;

  const lineWords = new Set(line.toLowerCase().split(/\s+/).filter(Boolean));
  const isKnown = (word: string) => lineWords.has(word.toLowerCase());

  // Tokenisiert wie removeCodes() (Wörter und die Trennzeichen dazwischen,
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

// --- Öffentliche Formel -------------------------------------------------------

/**
 * Familienzeile allein (Marke + Linie, Codes in Klammern): "MINI Cooper S
 * JCW (F55, F56, F57)", "BMW Älteres Modell" (keine Codes -> keine Klammer).
 * Ohne Motorisierung gibt es nichts, wonach eine Alternative ausgewählt
 * werden könnte - bei mehreren Alternativen gilt hier immer die erste
 * (Regel 1, "teilt keine ein Wort, gilt die erste Alternative").
 */
export function vehicleFamilyLine(family: VehicleLabelFamily): string {
  const { line, codes } = removeCodes(family.name, family.codes);
  const chosen = chooseAlternative(line, null);
  const withBrand = prependBrand(chosen, family.brand);
  return codes.length > 0 ? `${withBrand} (${codes.join(", ")})` : withBrand;
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
  const { line, codes } = removeCodes(family.name, family.codes);
  const chosenLine = chooseAlternative(line, model.name);
  const withMotorisierung = appendMotorisierung(chosenLine, model.name);
  const withBrand = prependBrand(withMotorisierung, family.brand);
  return codes.length > 0 ? `${withBrand} (${codes.join(", ")})` : withBrand;
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
