// Karosserieform aus dem Produktnamen ableiten und im Flow filtern.
// Entscheid 21.09.2026 (Rückfrage «kann das System zwischen Touring und
// Limousine unterscheiden?»): die Excel-Preisliste hat keine Karosserie-
// Spalte, eine Datei bündelt Limousine und Touring (3er G20, G21), Coupé
// und Cabrio (2er F22, F23) oder 3-Türer, 5-Türer und Cabrio (MINI F56,
// F55, F57). Karosseriespezifisch sind fast nur Fahrwerksprodukte, und sie
// tragen die Karosserie auf zwei Arten im Namen:
//   - als Wort: «Sportfahrwerk höhenverstellbar Touring», «Sportfedersatz
//     Cabrio», «Sportfedersatz -25mm G15 Coupé», «Sportfedersatz G16 Gran
//     Coupé»
//   - als Baureihen-Code: «Sportfedernsatz F31,34», «Sportfahrwerk
//     höhenverstellbar F32, 36», «Sportfedersatz -25mm G31», «Sportfedernsatz
//     für F11 4-Zylinder»
// Das unbeschriftete Gegenstück («Sportfahrwerk höhenverstellbar» neben
// «Sportfahrwerk höhenverstellbar Touring») ist die jeweils andere
// Karosserieform der Baureihe. Siehe docs/excel-import.md, Abschnitt
// «Karosserieform und Antrieb», für die Regeln mit Beispielen.
//
// Aufbau (analog lib/catalog/gearbox.ts):
//   - BODY_STYLE_BY_CODE: welche Karosserieform ein Baureihen-Code
//     bezeichnet (feste BMW-/MINI-Fakten, keine Kundendaten).
//   - familyBodyStyles(codes): die Karosserieformen einer Baureihe.
//   - bodyStylesFor(name, familyCodes): Karosserieformen aus dem Namen.
//   - assignBodyStyles(products, familyCodes): Import-Nachlauf je Familie
//     (Erkennung plus Geschwister-Regel für unbeschriftete Gegenstücke).
//   - bodyStyleProductVisible(productStyles, chosen): Filter im Flow.
//   - bodyStyleFromText(text): Karosserieform aus einem Klartext, z.B. der
//     gewählten Modell-Alternative «Cabrio» (inquiries.line) oder der
//     Schnellweg-Extraktion.
import type { BodyStyle } from "@/lib/db/rows";

/** Anzeigereihenfolge der Chips im Fahrzeug-Schritt und im Admin. */
export const BODY_STYLE_ORDER: readonly BodyStyle[] = [
  "limousine",
  "touring",
  "gran_turismo",
  "coupe",
  "cabrio",
  "gran_coupe",
  "dreituerer",
  "fuenftuerer",
];

export function isBodyStyle(value: unknown): value is BodyStyle {
  return typeof value === "string" && (BODY_STYLE_ORDER as readonly string[]).includes(value);
}

/**
 * Baureihen-Code -> Karosserieform. Nur Codes, deren Baureihe in einer
 * Preisliste mit mehreren Karosserieformen vorkommt (oder vorkommen könnte);
 * Codes mit nur einer Karosserieform (X-Modelle, Z4, Supra, iX3, M2) fehlen
 * bewusst - dort gibt es nichts zu unterscheiden. Langversionen (F35, G38,
 * G12) gelten als Limousine.
 */
export const BODY_STYLE_BY_CODE: Readonly<Record<string, BodyStyle>> = {
  // 1er
  F20: "fuenftuerer",
  F21: "dreituerer",
  E82: "coupe",
  // 2er
  F22: "coupe",
  F23: "cabrio",
  F44: "gran_coupe",
  G42: "coupe",
  F87: "coupe",
  G87: "coupe",
  // 3er
  F30: "limousine",
  F31: "touring",
  F34: "gran_turismo",
  F35: "limousine",
  G20: "limousine",
  G21: "touring",
  F80: "limousine",
  G80: "limousine",
  G81: "touring",
  // 4er
  F32: "coupe",
  F33: "cabrio",
  F36: "gran_coupe",
  G22: "coupe",
  G23: "cabrio",
  G26: "gran_coupe",
  F82: "coupe",
  F83: "cabrio",
  G82: "coupe",
  G83: "cabrio",
  // 5er
  F10: "limousine",
  F11: "touring",
  G30: "limousine",
  G31: "touring",
  G38: "limousine",
  G60: "limousine",
  G61: "touring",
  F90: "limousine",
  G90: "limousine",
  G99: "touring",
  // 6er
  F06: "gran_coupe",
  F12: "cabrio",
  F13: "coupe",
  // 7er
  G11: "limousine",
  G12: "limousine",
  // 8er
  G14: "cabrio",
  G15: "coupe",
  G16: "gran_coupe",
  F91: "cabrio",
  F92: "coupe",
  F93: "gran_coupe",
  // MINI
  F55: "fuenftuerer",
  F56: "dreituerer",
  F57: "cabrio",
  F65: "fuenftuerer",
  F66: "dreituerer",
  F67: "cabrio",
};

/** Die Karosserieformen einer Baureihe laut ihren Codes, in BODY_STYLE_ORDER, ohne Duplikate. */
export function familyBodyStyles(familyCodes: readonly string[]): BodyStyle[] {
  const set = new Set<BodyStyle>();
  for (const code of familyCodes) {
    const style = BODY_STYLE_BY_CODE[code.toUpperCase()];
    if (style) set.add(style);
  }
  return sortBodyStyles([...set]);
}

export function sortBodyStyles(styles: Iterable<BodyStyle>): BodyStyle[] {
  return [...new Set(styles)].sort((a, b) => BODY_STYLE_ORDER.indexOf(a) - BODY_STYLE_ORDER.indexOf(b));
}

// --- Wörter im Namen -----------------------------------------------------

// Reihenfolge wichtig: «Gran Coupé» vor «Coupé», «Gran Turismo» eigenständig
// (kein «GT», das träfe «GTS»-Zubehör). «Cabriolet»/«Convertible» decken
// abweichende Schreibweisen ab. Ohne Wortgrenzen-Ende bei Coupé, weil «é»
// für \b kein Wortzeichen ist.
const TERM_PATTERNS: readonly { style: BodyStyle; re: RegExp }[] = [
  { style: "gran_coupe", re: /\bGran[d]?\s*Coup[eé]/i },
  { style: "gran_turismo", re: /\bGran\s*Turismo\b/i },
  { style: "touring", re: /\bTouring\b/i },
  { style: "cabrio", re: /\bCabrio(?:let)?\b|\bConvertible\b/i },
  { style: "coupe", re: /(?<!Gran\s)(?<!Grand\s)\bCoup[eé]/i },
  { style: "limousine", re: /\bLimousine\b/i },
  { style: "dreituerer", re: /\b3-?T[üu]rer\b/i },
  { style: "fuenftuerer", re: /\b5-?T[üu]rer\b/i },
];

/**
 * Baureihen-Codes im Namen, beschränkt auf die Codes der eigenen Familie.
 * Deckt auch die Excel-Kurzschreibweise «F31, 34» / «F32/36» / «F31,34, F35»
 * ab: eine nackte zwei- bis dreistellige Zahl direkt nach einem Code (nur
 * durch «,», «/» oder Leerzeichen getrennt) erbt dessen Buchstaben. Liefert
 * die gefundenen Textstellen mit, damit stripBodyTokens() sie entfernen
 * kann.
 */
function codeMatches(name: string, familyCodes: readonly string[]): { code: string; start: number; end: number }[] {
  const allowed = new Set(familyCodes.map((c) => c.toUpperCase()));
  const out: { code: string; start: number; end: number }[] = [];
  // Nach den Ziffern bewusst KEINE Wortgrenze verlangt: die Excel klebt
  // vereinzelt ein Wort direkt an den Code («Performance Nieren Satz
  // G30/G31Satz ...»), der zweite Code muss trotzdem zählen, sonst gälte
  // das Produkt fälschlich nur für die Limousine. Ein Ziffern-Lookahead
  // reicht, damit «F300» kein «F30» ist.
  const re = /\b([EFGUR])(\d{2,3})(?!\d)((?:\s*[,/]?\s*\b\d{2,3}\b(?![a-zA-Z]))*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(name)) !== null) {
    const letter = m[1].toUpperCase();
    const first = `${letter}${m[2]}`;
    const start = m.index;
    let end = m.index + m[1].length + m[2].length;
    if (allowed.has(first)) out.push({ code: first, start, end });
    // Fortsetzungen «, 34» / «/36»: nur übernehmen, wenn der geerbte Code
    // ebenfalls zur Familie gehört - sonst ist die Zahl etwas anderes (z.B.
    // eine Tieferlegung «-25mm» steht nie direkt nach einem Code, aber
    // «F35 30e» endet mit einem Buchstaben und ist ausgeschlossen).
    const tail = m[3] ?? "";
    const tailRe = /\s*[,/]?\s*\b(\d{2,3})\b/g;
    let t: RegExpExecArray | null;
    while ((t = tailRe.exec(tail)) !== null) {
      const code = `${letter}${t[1]}`;
      if (!allowed.has(code)) break;
      end = m.index + m[1].length + m[2].length + t.index + t[0].length;
      out.push({ code, start, end });
    }
  }
  return out;
}

/**
 * Karosserieformen, die ein Produktname nennt (Wort oder Baureihen-Code der
 * eigenen Familie), in BODY_STYLE_ORDER. Leer, wenn der Name keine nennt.
 * Nennt der Name ALLE Karosserieformen der Familie («Sportfedernsatz F31,34,
 * F35 30e» in einer Familie mit F30/F31/F34/F35), gilt er als neutral (leer).
 */
export function bodyStylesFor(name: string, familyCodes: readonly string[]): BodyStyle[] {
  const family = familyBodyStyles(familyCodes);
  if (family.length < 2) return [];

  const found = new Set<BodyStyle>();
  for (const { style, re } of TERM_PATTERNS) {
    if (re.test(name)) found.add(style);
  }
  for (const { code } of codeMatches(name, familyCodes)) {
    const style = BODY_STYLE_BY_CODE[code];
    if (style) found.add(style);
  }

  // Nur Karosserieformen, die die Familie überhaupt hat: «Cabrio» in einem
  // Namen einer Limousine/Touring-Familie wäre ein Hinweis auf ein anderes
  // Fahrzeug (z.B. «Verdeckmodul»), keine Einschränkung dieses Produkts.
  const relevant = [...found].filter((s) => family.includes(s));
  if (relevant.length === 0 || relevant.length >= family.length) return [];
  return sortBodyStyles(relevant);
}

/**
 * Name ohne die Karosserie-Wörter/-Codes, normalisiert (Kleinschreibung,
 * ein Leerzeichen, keine Trennzeichen-Reste an den Rändern) - Schlüssel für
 * die Geschwister-Regel in assignBodyStyles().
 */
export function stripBodyTokens(name: string, familyCodes: readonly string[]): string {
  let text = name;
  const ranges = codeMatches(text, familyCodes).sort((a, b) => b.start - a.start);
  for (const r of ranges) text = `${text.slice(0, r.start)} ${text.slice(r.end)}`;
  for (const { re } of TERM_PATTERNS) text = text.replace(new RegExp(re.source, `${re.flags}g`), " ");
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s,/;:-]+|[\s,/;:-]+$/g, "")
    .trim();
}

export interface BodyStyleAssignable {
  name: string;
  sourceCategory: string;
  bodyStyles: BodyStyle[];
}

/**
 * Import-Nachlauf je Familie: setzt bodyStyles auf jedem Produkt.
 *   1. Erkennung aus dem Namen (bodyStylesFor()).
 *   2. Geschwister-Regel: ein unbeschriftetes Produkt, dessen normalisierter
 *      Name dem Namen eines beschrifteten Produkts derselben Excel-Kategorie
 *      OHNE dessen Karosserie-Wörter/-Codes entspricht («Sportfahrwerk
 *      höhenverstellbar» neben «Sportfahrwerk höhenverstellbar Touring»),
 *      bekommt die übrigen Karosserieformen der Familie (alle, die keines
 *      der gleichnamigen beschrifteten Geschwister nennt). Bleibt nichts
 *      übrig, bleibt das Produkt neutral.
 * Familien mit weniger als zwei Karosserieformen (laut Codes) bekommen
 * überall leere Listen. Ebenso Familien, die die Karosserie bereits über
 * die Motorisierung unterscheiden (ein Modellname nennt eine Karosserieform:
 * «M3 Touring», «M4 Cabrio», «M5 Touring»): dort regelt das Fitment je
 * Modell, welche Produkte passen, eine Karosserie-Zuordnung je Produkt
 * hätte nur falsche Fragen und Prüfhinweise zur Folge (die Geschwister-
 * Regel gäbe z.B. «Sportfedernsatz für M4 xDrive» neben «... für M4 Cabrio
 * xDrive» die Karosserien Limousine, Touring und Coupé). Liefert Warnungen
 * für die Import-Übersicht.
 */
export function assignBodyStyles<T extends BodyStyleAssignable>(
  products: T[],
  familyCodes: readonly string[],
  modelNames: readonly string[] = [],
): { warnings: string[] } {
  const family = familyBodyStyles(familyCodes);
  const warnings: string[] = [];
  const distinguishedByModel = modelNames.some((name) => bodyStyleFromText(name) !== null);
  if (family.length < 2 || distinguishedByModel) {
    for (const p of products) p.bodyStyles = [];
    return { warnings };
  }

  for (const p of products) p.bodyStyles = bodyStylesFor(p.name, familyCodes);

  // Schlüssel -> Karosserieformen aller beschrifteten Produkte mit diesem
  // Basis-Namen (je Excel-Kategorie).
  const taggedByKey = new Map<string, Set<BodyStyle>>();
  for (const p of products) {
    if (p.bodyStyles.length === 0) continue;
    const key = `${p.sourceCategory}|${stripBodyTokens(p.name, familyCodes)}`;
    const set = taggedByKey.get(key) ?? new Set<BodyStyle>();
    for (const s of p.bodyStyles) set.add(s);
    taggedByKey.set(key, set);
  }

  for (const p of products) {
    if (p.bodyStyles.length > 0) continue;
    const key = `${p.sourceCategory}|${stripBodyTokens(p.name, familyCodes)}`;
    const tagged = taggedByKey.get(key);
    if (!tagged) continue;
    const remaining = family.filter((s) => !tagged.has(s));
    if (remaining.length === 0 || remaining.length >= family.length) continue;
    p.bodyStyles = remaining;
    warnings.push(
      `"${p.name}": Karosserieform ${remaining.join(", ")} über das beschriftete Gegenstück (${[...tagged].join(", ")}) abgeleitet`,
    );
  }

  return { warnings };
}

/**
 * true, wenn ein Produkt bei der gewählten Karosserieform sichtbar bleiben
 * soll (Kategorie-Schritt): neutrale Produkte (leere Liste) immer; ohne
 * Antwort alle; sonst nur Produkte, die die gewählte Karosserieform nennen.
 */
export function bodyStyleProductVisible(productStyles: readonly BodyStyle[], chosen: BodyStyle | null): boolean {
  if (productStyles.length === 0) return true;
  if (chosen === null) return true;
  return productStyles.includes(chosen);
}

/**
 * Karosserieform aus einem Klartext, z.B. dem Label einer Modell-Alternative
 * («Cabrio», «Grand Coupé», «X2») oder der Schnellweg-Extraktion («Touring»,
 * «Kombi»). null, wenn der Text keine (oder mehrere) nennt.
 */
export function bodyStyleFromText(text: string | null | undefined): BodyStyle | null {
  if (!text) return null;
  const found = new Set<BodyStyle>();
  for (const { style, re } of TERM_PATTERNS) {
    if (re.test(text)) found.add(style);
  }
  if (/\bKombi\b|\bEstate\b|\bWagon\b/i.test(text)) found.add("touring");
  if (/\bSedan\b|\bSaloon\b/i.test(text)) found.add("limousine");
  if (found.size !== 1) return null;
  return [...found][0];
}
