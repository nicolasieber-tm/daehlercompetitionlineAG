// Excel-Parser für die dÄHLer Produktelisten. Regeln: docs/excel-import.md
// (verbindlich, jede Regel dort ist Pflicht). Bei Unklarheiten in der Excel,
// die das Dokument nicht abdeckt: robust behandeln und eine Warnung in
// ParsedFamily.warnings ablegen, nie stillschweigend raten.
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { isCategoryRow, mapSourceCategory } from "@/lib/catalog/categories";
import { variantGroupFor } from "@/lib/catalog/variant-groups";
import { gearboxFor } from "@/lib/catalog/gearbox";
import { slug } from "@/lib/pricelist/slug";
import type {
  Brand,
  FlowCategory,
  FuelType,
  ParsedFamily,
  ParsedModel,
  ParsedNote,
  ParsedProduct,
  PriceStatus,
} from "@/lib/pricelist/types";

const TITLE_MARKER = "dÄHLer Produkteliste";

const IGNORED_HEADER_LABELS = new Set([
  "AW",
  "Lack",
  "Montage",
  "Teile",
  "Komplettpreis",
  "Teilepreis",
]);

const NAME_CONTINUATION_SUFFIXES = ["inkl.", "mit", "und", "für", "-", "/", ","];

/** docs/excel-import.md, Regel 6: wörtlich genannte Gruppenzeilen-Beispiele,
 * die üblicherweise ohne Preis/Marker vorkommen (siehe Prüfer-Befund #2,
 * Runde 2: X3 G45 hat eine Ausnahme davon). */
const GROUP_LABEL_LIKE_PREFIXES = [/^DME Leistungssteigerungen/i, /^DDE Leistungssteigerungen/i];

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------

// Rückmeldung aus dem ersten Klicktest (CLAUDE.md Abschnitt "AUFGABE",
// Punkt 1): vereinzelte Zellen (54 Produkte im Bestand) enthalten U+00A0
// (geschütztes Leerzeichen) statt eines normalen Leerzeichens, vermutlich
// aus einem Copy/Paste aus Word/PDF in die Excel. Sichtbar identisch, aber
// z.B. in Regex-Vergleichen (variantGroupFor, gearboxFor,
// lib/catalog/product-display.ts) ein anderes Zeichen als " ". Wird hier
// zentral für ALLE über trimOrNull gelesenen Zellen normalisiert (Namen,
// Beschreibungen, Hinweise, Gruppenbezeichnungen, RC, Artikelnummer,
// Preis-Präfix) - content_hash ändert sich dadurch für die betroffenen
// Produkte (Match beim Re-Import läuft über article_no+name, nicht über
// content_hash, siehe lib/pricelist/diff.ts, das ist unproblematisch).
function normalizeNbsp(value: string): string {
  return value.replace(/\u00A0/g, " ");
}

function trimOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = normalizeNbsp(String(value)).trim();
  return s.length > 0 ? s : null;
}

/** true, wenn irgendeine Zelle der Zeile einen Wert hat (Regel 1: Leer). */
function rowHasContent(row: unknown[] | undefined): boolean {
  if (!row) return false;
  // Zellen, die nur aus Leerzeichen bestehen (vereinzelt z. B. in Spalte A,
  // ein Excel-Formatierungsrest), zählen nicht als Inhalt.
  return row.some((v) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim() !== "";
    return true;
  });
}

function isLowercaseStart(text: string): boolean {
  const first = [...text][0];
  if (!first) return false;
  return first === first.toLowerCase() && first !== first.toUpperCase();
}

/**
 * docs/excel-import.md, Regel 7 "Trennstrich-Umbruch": endet der bisherige
 * Text auf "-" und beginnt die Fortsetzung mit einem Kleinbuchstaben, wird
 * ohne Leerzeichen zusammengefügt und der Trennstrich entfernt
 * ("Leistungs-" + "steigerungen" -> "Leistungssteigerungen"). Gilt
 * gleichermassen für Namen, Beschreibungen (dort sonst mit `separator`
 * "\n" verbunden) und Hinweise (dort "\n" gemäss Regel 8 mit " " ersetzt).
 * Sonst normale Verkettung über `separator`.
 */
function joinContinuationText(base: string, addition: string, separator: string): string {
  if (base.endsWith("-") && isLowercaseStart(addition)) {
    return `${base.slice(0, -1)}${addition}`;
  }
  return `${base}${separator}${addition}`;
}

function findHeaderCol(row0: unknown[], label: string): number {
  return row0.findIndex((v) => typeof v === "string" && v.trim() === label);
}

// ---------------------------------------------------------------------------
// Leistungsdaten aus dem Produktnamen (psBase, psTo, nmTo)
// ---------------------------------------------------------------------------

function parseNumberToken(raw: string): number | null {
  const cleaned = raw.replace(/['\s]/g, "");
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

export interface PerformanceParseResult {
  psBase: number[];
  psTo: number | null;
  nmTo: number | null;
  /** gesetzt, wenn eine Excel-Eigenheit ausserhalb der dokumentierten Muster robust aufgelöst wurde. */
  warning?: string;
}

/**
 * Leistungsdaten aus dem Produktnamen. Siehe docs/excel-import.md, Regel 5,
 * Unterpunkt "Leistungsdaten aus dem Namen", inkl. aller dort genannten
 * Beispiele.
 */
export function parsePerformance(rawName: string): PerformanceParseResult {
  const basisMatches = [...rawName.matchAll(/\(Basis[^)]*\)/gi)];
  const psBase: number[] = [];
  for (const m of basisMatches) {
    // Zahlen unmittelbar vor "PS)" innerhalb der Basis-Klammer, ohne
    // Buchstaben-Codes wie "S63" mitzunehmen (negativer Lookbehind auf
    // Buchstaben UND Ziffern, damit z. B. die "3" aus "S63" nicht als
    // Anfang der eigentlichen Zahl erkannt wird).
    const numMatch = m[0].match(/(?<![A-Za-z0-9])(\d[\d'\s/]*)\s*PS\s*\)/i);
    if (!numMatch) continue;
    for (const part of numMatch[1].split("/")) {
      const n = parseNumberToken(part);
      if (n !== null) psBase.push(n);
    }
  }

  // Basis-Klammer(n) entfernen, damit ps_to/nm_to nicht versehentlich aus der
  // Basis-Angabe gelesen werden ("das erste Vorkommen, das nicht innerhalb
  // der Basis-Klammer steht").
  let rest = rawName;
  for (const m of basisMatches) rest = rest.replace(m[0], " ");

  let psTo: number | null = null;
  let nmTo: number | null = null;
  let warning: string | undefined;

  // Zahl (mit optionalem Apostroph und optionalem *) PS / Zahl Nm. Beide
  // Zahlen sind optional, damit auch "PS/780 Nm" (Zahl vor PS fehlt) und
  // "PS /  Nm" (beide leer -> null) greifen. Prüfung Phase B, Punkt 8c:
  // zwischen "PS /" und "Nm" steht bei einem Nm-BEREICH ("360 PS / 480 - 530
  // Nm", 5er F10/F11 Zeile 12) zusätzlich eine untere Grenze mit
  // Bindestrich - die optionale, nicht-erfassende Gruppe überspringt sie,
  // die zweite Erfassungsgruppe nimmt dann die OBERE (zweite) Zahl des
  // Bereichs (530), nicht die untere.
  const primary = rest.match(/(\d[\d']*)?\*?\s*PS\s*\/\s*(?:\d[\d']*\s*-\s*)?(\d[\d']*)?\*?\s*Nm/i);
  if (primary) {
    if (primary[1]) psTo = parseNumberToken(primary[1]);
    if (primary[2]) nmTo = parseNumberToken(primary[2]);
  }

  // Excel-Eigenheit (nicht in docs/excel-import.md beschrieben): in einzelnen
  // Zeilen steht "158 / PS / 264 Nm" statt "158 PS / 264 Nm" (Tippfehler mit
  // zusätzlichem Schrägstrich). Robust auflösen statt den PS-Wert zu verlieren.
  if (psTo === null) {
    const fallback = rest.match(/(\d[\d']*)\s*\/\s*PS\b/i);
    if (fallback) {
      psTo = parseNumberToken(fallback[1]);
      warning = `PS-Wert aus ungewöhnlichem Muster "${fallback[0].trim()}" übernommen (Tippfehler in Excel vermutet)`;
    }
  }

  return { psBase, psTo, nmTo, warning };
}

// ---------------------------------------------------------------------------
// Preisfelder: Auflösen der vier Preiszellen, Preisstatus, price_note.
//
// Befund #5: price_note wird IMMER aus allen nicht-numerischen Preissignalen
// gebildet, auch wenn price_status "priced" ist (vorher: note bei priced
// verworfen). Zahlen mit Apostroph-Tausendertrennzeichen ("1'240", von Excel
// als Text geliefert) werden als numerisch erkannt statt als Text behandelt.
// Befund #4: die Zelle unmittelbar links der ersten CHF-Spalte (verbundene
// "Teilepreis"-Kopfzelle) wird als Präfix ("ab") gelesen und in price_note
// übernommen; sie zählt zusätzlich als "price_parts gefüllt" für Regel 5.
// ---------------------------------------------------------------------------

/** Apostroph-Tausendertrennzeichen ("1'240") als Zahl erkennen, sonst null. */
function parseApostropheNumber(text: string): number | null {
  if (!/^\d{1,3}(?:'\d{3})*$/.test(text)) return null;
  const n = parseInt(text.replace(/'/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

interface ResolvedCell {
  /** Numerischer Wert, inkl. als Apostroph-Zahl erkanntem Text. */
  num: number | null;
  /** Text, wenn die Zelle eine echte Textangabe ist (z. B. "in Vorb.", "auf Anfr."). */
  text: string | null;
}

function resolvePriceCell(v: number | string | null): ResolvedCell {
  if (typeof v === "number") return { num: v, text: null };
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "") return { num: null, text: null };
    const apostropheNum = parseApostropheNumber(t);
    if (apostropheNum !== null) return { num: apostropheNum, text: null };
    return { num: null, text: t };
  }
  return { num: null, text: null };
}

interface ResolvedPrices {
  pricePartsChf: number | null;
  priceInstallChf: number | null;
  priceApprovalChf: number | null;
  priceTotalChf: number | null;
  priceStatus: PriceStatus;
  priceNote: string | null;
  /** Teilepreis ist Text (kein Apostroph-Zahl) und Total trotzdem numerisch:
   * der Total-Betrag enthält dann nur Teilbeträge (Montage/Gutachten),
   * siehe Befund #5. */
  totalOnlyPartialSum: boolean;
}

/**
 * Löst die vier Preiszellen auf (Regel 5) und bildet price_status und
 * price_note. `pricePrefix` ist die Zelle unmittelbar links der ersten
 * CHF-Spalte (Befund #4), meist "ab" - wird zusätzlich in price_note
 * übernommen.
 */
function computePriceFields(
  rawParts: number | string | null,
  rawInstall: number | string | null,
  rawApproval: number | string | null,
  rawTotal: number | string | null,
  pricePrefix: string | null,
): ResolvedPrices {
  const rParts = resolvePriceCell(rawParts);
  const rInstall = resolvePriceCell(rawInstall);
  const rAppr = resolvePriceCell(rawApproval);
  const rTotal = resolvePriceCell(rawTotal);

  const textCells = [rParts.text, rInstall.text, rAppr.text, rTotal.text].filter(
    (v): v is string => v !== null,
  );
  const hasVorb = textCells.some((v) => /vorb/i.test(v));
  // Prüfung Phase B, Punkt 8d: "auf Anfr." oder "inkl." im TEILEPREIS
  // (price_parts) bei gleichzeitig numerischem Total bedeuten trotzdem
  // price_status "on_request", nicht "priced" - der Total-Betrag ist dann
  // nur ein Teilbetrag (Montage/Gutachten, siehe totalOnlyPartialSum unten),
  // der eigentliche Teilepreis ist nicht beziffert. Beispiel (echte Zeile,
  // 2er F22, F23.xls): "Heckflügel GTS in GFK"/"Heckflügel Carbon",
  // Teilepreis "auf Anfr.", Montage 350, Total 350. price_note trägt den
  // Text weiterhin (noteParts unten, unverändert von Befund #5).
  const partsSignalsOnRequest = rParts.text !== null && /(auf\s*anfr\.?|inkl\.?)/i.test(rParts.text);
  const status: PriceStatus =
    rTotal.num !== null
      ? partsSignalsOnRequest
        ? "on_request"
        : "priced"
      : hasVorb
        ? "in_preparation"
        : "on_request";

  const noteParts = [pricePrefix, ...textCells].filter((v): v is string => !!v);
  const note = noteParts.length > 0 ? noteParts.join(", ") : null;

  return {
    pricePartsChf: rParts.num !== null ? Math.round(rParts.num) : null,
    priceInstallChf: rInstall.num !== null ? Math.round(rInstall.num) : null,
    priceApprovalChf: rAppr.num !== null ? Math.round(rAppr.num) : null,
    priceTotalChf: rTotal.num !== null ? Math.round(rTotal.num) : null,
    priceStatus: status,
    priceNote: note,
    totalOnlyPartialSum: rTotal.num !== null && rParts.text !== null,
  };
}

/**
 * Prüfung Phase B, Punkt 8a: eine DME/DDE-Gruppenzeile ("DME
 * Leistungssteigerungen:", "DDE Leistungssteigerungen Dieselmotoren:", ...)
 * gilt nur für die eigentlichen Leistungsstufen-Produkte (variant_group
 * "leistung") der Kategorie, nicht für andere Motor-Produkte, die in der
 * Excel zufällig danach in derselben Kategorie folgen, bevor die nächste
 * Gruppenzeile oder Kategorie kommt (z. B. "Einbau Leistungssteigerung" -
 * laut lib/catalog/variant-groups.ts ausdrücklich KEIN Leistungsprodukt,
 * eine reine Montagepauschale zu einer an anderer Stelle gewählten Stufe,
 * ebenso "Aufhebung der serienmässigen V/max Begrenzung" ohne "Stufe"/
 * "(Basis"/"Leistungssteigerung" im Namen). Für diese anderen Produkte
 * bleibt group_label null, auch wenn currentGroupLabel zum Zeitpunkt der
 * Zeile technisch noch die DME/DDE-Überschrift ist. Andere Gruppenzeilen
 * (Distanzscheiben, dÄHLer Endrohre, Radsätze, ...) sind unverändert: sie
 * gelten für ALLE nachfolgenden Produkte der Kategorie bis zur nächsten
 * Gruppenzeile/Kategorie, wie in docs/excel-import.md beschrieben.
 */
function resolveGroupLabel(
  groupLabel: string | null,
  category: FlowCategory,
  productName: string,
): string | null {
  if (groupLabel === null || !/^(DME|DDE)\b/i.test(groupLabel)) return groupLabel;
  return variantGroupFor(category, productName) === "leistung" ? groupLabel : null;
}

// ---------------------------------------------------------------------------
// content_hash
// ---------------------------------------------------------------------------

function computeContentHash(p: {
  category: string;
  name: string;
  description: string | null;
  articleNo: string | null;
  pricePartsChf: number | null;
  priceInstallChf: number | null;
  priceApprovalChf: number | null;
  priceTotalChf: number | null;
  priceStatus: string;
  fits: string[];
}): string {
  const input = [
    p.category,
    p.name,
    p.description ?? "",
    p.articleNo ?? "",
    p.pricePartsChf ?? "",
    p.priceInstallChf ?? "",
    p.priceApprovalChf ?? "",
    p.priceTotalChf ?? "",
    p.priceStatus,
    [...p.fits].sort().join(","),
  ].join("|");
  return createHash("sha1").update(input).digest("hex");
}

/**
 * Befund #2 (Bericht), Kommentar korrigiert (Prüfung Phase B, Punkt 8):
 * docs/excel-import.md definiert content_hash ohne Zeilenbezug, wodurch
 * strukturell identische Zeilen (z. B. "Adaptersatz inkl. Radschrauben und
 * Nabenkappen", einmal pro Radsatz mit identischem Namen/Preis/Fitment
 * wiederholt) denselben Hash erhalten - das ist laut docs/excel-import.md
 * ("content_hash ... ist NICHT eindeutig je Familie ... er dient dem Diff,
 * nicht als Schlüssel") und der Migration (`db/migrations/0001_init.sql`,
 * Kommentar an products.content_hash: "bewusst nicht unique ... Index statt
 * Constraint") ausdrücklich SO VORGESEHEN,
 * keine Constraint-Verletzung: ein früherer Kommentar hier behauptete
 * fälschlich einen `unique(family_id, content_hash)`-Constraint, den es
 * nicht gibt und der den Import angeblich abbrechen würde. Der tatsächliche
 * Grund für die Disambiguierung: lib/pricelist/diff.ts
 * matchFamilyProducts() (Durchgang 1, content_hash) und
 * lib/pricelist/apply.ts planProducts() lesen content_hash über einen Pool
 * (Map<hash, Product[]>) und wählen bei mehreren Kandidaten über
 * pickBestCandidate() (source_row, dann Fitment) aus - funktioniert auch
 * ohne eindeutigen Hash-String. Ein je Duplikat eindeutiger Hash macht die
 * Zuordnung beim Re-Import (nächstes Quartal) trotzdem robuster und billiger
 * (direkter Treffer statt Tie-Breaker) und macht jede Zeile für
 * Debugging/Tests eindeutig identifizierbar. Nur bei einer tatsächlichen
 * Kollision innerhalb der Familie wird der laufende Index der Dublette in
 * den Hash-Input aufgenommen (die dokumentierte Formel bleibt für alle
 * nicht kollidierenden Zeilen, die grosse Mehrheit, unverändert) und eine
 * Warnung ausgegeben.
 */
function disambiguateDuplicateHashes(products: ParsedProduct[], warnings: string[]): void {
  const seen = new Map<string, ParsedProduct[]>();
  for (const p of products) {
    const group = seen.get(p.contentHash);
    if (group) group.push(p);
    else seen.set(p.contentHash, [p]);
  }
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      const p = group[i];
      const original = p.contentHash;
      p.contentHash = createHash("sha1").update(`${original}|dup${i + 1}`).digest("hex");
      warnings.push(
        `Zeile ${p.sourceRow}: content_hash identisch mit ${group
          .filter((_, j) => j !== i)
          .map((o) => `Zeile ${o.sourceRow}`)
          .join(", ")} ("${p.name}"), Dublette ${i + 1}/${group.length} über laufenden Index disambiguiert`,
      );
    }
  }
}

/**
 * Befund #1 (Bericht): Gutachten- und Garantie-Hinweiszeilen (RC A, Nummer
 * 77, "Ein DTC- / CH- Gutachten ist ..." bzw. RC N, Nummer 777, "Eine
 * Ergänzungsgarantie ...") tragen in vielen Dateien einen Betrag in der
 * Gutachten- UND/ODER Total-Spalte (450, teils 600/300) oder "in Vorb." im
 * Teilepreis. Nach Regel 5 (Doku) würden sie dadurch als Produkt erkannt.
 * Beide Muster sind aber ausschliesslich als allgemeiner Hinweistext zu
 * beobachten (nie als Artikel mit eigenem Fitment-Sinn) und werden deshalb
 * VOR Regel 5 abgefangen, unabhängig davon, ob eine Preiszelle gefüllt ist.
 * Abgrenzung: "DTC Gutachten zu Distanzscheiben" und "Gutachten zu
 * Spoiler(lippe)" sind eigene, echte Produkte mit RC A und Nummer 77 (Text
 * beginnt NICHT mit "Ein DTC"), bleiben also unberührt.
 */
function isGutachtenOderGarantieHinweis(name: string): boolean {
  return /^Ein DTC/i.test(name) || /^Eine Ergänzungsgarantie/i.test(name);
}

// ---------------------------------------------------------------------------
// Marke und Codes aus dem Baureihennamen
// ---------------------------------------------------------------------------

function detectBrand(name: string): Brand {
  if (name.startsWith("MINI")) return "MINI";
  if (name.startsWith("TOYOTA")) return "Toyota";
  return "BMW";
}

function extractCodes(name: string): string[] {
  const tokens = name.split(/[\s,/]+/).filter(Boolean);
  const codes: string[] = [];
  for (const t of tokens) {
    if (/^[EFGUR]\d{2,3}$/.test(t) || /^NA\d$/.test(t)) codes.push(t);
  }
  return codes;
}

// ---------------------------------------------------------------------------
// Kraftstoff-Gruppe (Zeile 1, vorwärts auffüllen)
// ---------------------------------------------------------------------------

function detectFuelKeyword(text: string | null): FuelType {
  if (!text) return null;
  const hits: { idx: number; val: FuelType }[] = [];
  const b = text.search(/benzin/i);
  const d = text.search(/diesel/i);
  const e = text.search(/elektro/i);
  if (b >= 0) hits.push({ idx: b, val: "benzin" });
  if (d >= 0) hits.push({ idx: d, val: "diesel" });
  if (e >= 0) hits.push({ idx: e, val: "elektro" });
  if (hits.length === 0) return null;
  hits.sort((a, b2) => a.idx - b2.idx);
  return hits[0].val;
}

/** Entfernt die eigene Disambiguierungs-Klammer (Befund #6), damit die
 * Namensplausibilität unten den ursprünglichen Excel-Text prüft. */
function stripFuelDisambiguation(name: string): string {
  return name.replace(/ \((Diesel|Benzin|Elektro)\)$/, "");
}

/**
 * Prüfer-Befund #1 (Runde 2): Kraftstoff-Köpfe ("Benzin"/"Diesel"/"Elektro"
 * in Zeile 1, siehe docs/excel-import.md "Kraftstoff-Gruppe") sind in
 * einzelnen Dateien falsch positioniert - ein Merge beginnt eine Spalte zu
 * früh und "verschluckt" die letzte Motorisierung der vorherigen Gruppe
 * (7er G11/G12: "M760i" unter "Diesel"; MINI F55/56/57: "JCW GP3" unter
 * "Diesel"), oder ein Kopf fehlt komplett, sodass Motorisierungen ohne
 * Kraftstoff bleiben (X1 U11/X2 U10: "Benzin" fehlt ganz, "20i"/"23i" ohne
 * Kraftstoff, "Diesel" beginnt erst bei "30e"; 4er G22/G23/G26: "Diesel"
 * fehlt ganz, "20d"/"30d"/"M40d" erben "benzin"). Der Parser folgt weiterhin
 * der Doku (vorwärts auffüllen, kein Eingriff in die Daten), meldet die
 * Unplausibilität aber als Warnung (Datenfehler, dem Kunden zu melden):
 *  a) Namensplausibilität: Motorisierung mit fuel "diesel", deren Name nicht
 *     auf "d"/"D" endet; Motorisierung ganz ohne Kraftstoff, obwohl die
 *     Datei Kraftstoff-Köpfe hat; Motorisierung, deren Name auf "d"/"D"
 *     endet, aber nicht als diesel eingestuft ist. Über die eigene
 *     Disambiguierungs-Klammer (Befund #6) hinweg geprüft - Motorisierungen,
 *     deren Kraftstoff bereits eindeutig über die tatsächliche Spaltenlage
 *     eines Kopfes aufgelöst wurde (z. B. "Countryman One (Diesel)"), sind
 *     unauffällig und werden übersprungen.
 *  b) Merge-Position: `ws['!merges']` ausgewertet - beginnt der ERSTE
 *     Kraftstoff-Kopf einer Datei nicht an der ersten Motorisierungsspalte,
 *     fehlt links davon ein Kopf komplett (X1 U11/X2 U10).
 */
function validateFuelPlausibility(
  modelCols: { colIdx: number; name: string; fuel: FuelType }[],
  fuelHeaderCells: { colIdx: number; keyword: NonNullable<FuelType> }[],
  ws: XLSX.WorkSheet,
  warnings: string[],
): void {
  if (fuelHeaderCells.length === 0 || modelCols.length === 0) return;

  for (const mc of modelCols) {
    if (/ \((Diesel|Benzin|Elektro)\)$/.test(mc.name)) continue; // Befund #6: bereits eindeutig aufgelöst
    const stripped = stripFuelDisambiguation(mc.name);
    const endsWithD = /d$/i.test(stripped);
    const cellRef = `${XLSX.utils.encode_col(mc.colIdx)}2`;
    if (mc.fuel === null) {
      warnings.push(
        `Datenfehler in der Excel (dem Kunden melden): Motorisierung "${mc.name}" (Spalte ${cellRef}) hat keinen Kraftstoff, obwohl die Datei Kraftstoff-Köpfe (Benzin/Diesel/Elektro) enthält - vermutlich fehlt der Kopf über dieser Spalte.`,
      );
    } else if (mc.fuel === "diesel" && !endsWithD) {
      warnings.push(
        `Datenfehler in der Excel (dem Kunden melden): Motorisierung "${mc.name}" (Spalte ${cellRef}) ist als diesel eingestuft, der Name endet aber nicht auf "d" - unplausibel, vermutlich beginnt der "Diesel"-Kopf eine Spalte zu früh.`,
      );
    } else if (mc.fuel !== "diesel" && endsWithD) {
      warnings.push(
        `Datenfehler in der Excel (dem Kunden melden): Motorisierung "${mc.name}" (Spalte ${cellRef}) endet auf "d", ist aber als ${mc.fuel ?? "kein Kraftstoff"} eingestuft - unplausibel, vermutlich beginnt der "Diesel"-Kopf eine Spalte zu spät.`,
      );
    }
  }

  const firstHeader = fuelHeaderCells[0];
  const merges = ws["!merges"] ?? [];
  const merge = merges.find((m) => m.s.r === 0 && m.s.c === firstHeader.colIdx);
  const mergeStartCol = merge ? merge.s.c : firstHeader.colIdx;
  const firstModelColIdx = modelCols[0].colIdx;
  if (mergeStartCol !== firstModelColIdx) {
    const gapModels = modelCols.filter((mc) => mc.colIdx < mergeStartCol).map((mc) => mc.name);
    const mergeRange = merge
      ? `${XLSX.utils.encode_col(merge.s.c)}1:${XLSX.utils.encode_col(merge.e.c)}1`
      : `${XLSX.utils.encode_col(mergeStartCol)}1`;
    warnings.push(
      `Datenfehler in der Excel (dem Kunden melden): Kraftstoff-Kopf "${firstHeader.keyword}" beginnt bei ${mergeRange}, nicht bei der ersten Motorisierungsspalte ${XLSX.utils.encode_col(firstModelColIdx)}1 - vermutlich fehlt links davon ein Kraftstoff-Kopf (z. B. "Benzin"). Motorisierungen ohne Kraftstoff-Kopf: ${gapModels.join(", ")}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

function toWorkbook(buffer: ArrayBuffer | Buffer): XLSX.WorkBook {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return XLSX.read(data, { type: "buffer", raw: true });
}

export function parseWorkbook(buffer: ArrayBuffer | Buffer, sourceFile: string): ParsedFamily {
  const warnings: string[] = [];
  const wb = toWorkbook(buffer);

  if (wb.SheetNames.length !== 1) {
    warnings.push(
      `Datei hat ${wb.SheetNames.length} Blätter statt einem, erstes Blatt "${wb.SheetNames[0]}" verwendet`,
    );
  }
  const sheetName = wb.SheetNames.includes("Planung") ? "Planung" : wb.SheetNames[0];
  if (sheetName !== "Planung") {
    warnings.push(`Blatt heisst "${sheetName}" statt "Planung"`);
  }
  const ws = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  const row0 = rows[0] ?? [];
  const row1 = rows[1] ?? [];

  // Plausibilitätsprüfung Titel (Zeile 1, Spalte B)
  const titleCell = trimOrNull(row0[1]);
  if (!titleCell || !titleCell.includes(TITLE_MARKER)) {
    throw new Error(`${sourceFile}: keine Produkteliste (Titel "${TITLE_MARKER}" in Zeile 1 Spalte B fehlt)`);
  }

  // Baureihe (Zeile 2, Spalte B)
  const familyNameRaw = trimOrNull(row1[1]);
  if (!familyNameRaw) {
    throw new Error(`${sourceFile}: Baureihe (Zeile 2, Spalte B) fehlt`);
  }
  const familyName = familyNameRaw;
  const brand = detectBrand(familyName);
  const codes = extractCodes(familyName);

  // Nummer- und RC-Spalte
  const numberColIdx = findHeaderCol(row0, "Nummer");
  if (numberColIdx < 0) {
    throw new Error(`${sourceFile}: Spalte "Nummer" nicht gefunden`);
  }
  const rcIdx = findHeaderCol(row0, "RC");
  if (rcIdx < 0) {
    warnings.push('Spalte "RC" nicht gefunden, rc wird immer null');
  }

  const pricelistNoRaw = row1[numberColIdx];
  const pricelistNo =
    typeof pricelistNoRaw === "number"
      ? String(pricelistNoRaw)
      : trimOrNull(pricelistNoRaw);

  // Preisspalten: die vier Spalten, in denen Zeile 2 "CHF" enthält.
  const chfIdx: number[] = [];
  row1.forEach((v, i) => {
    if (typeof v === "string" && v.includes("CHF")) chfIdx.push(i);
  });
  if (chfIdx.length !== 4) {
    throw new Error(
      `${sourceFile}: ${chfIdx.length} CHF-Preisspalten gefunden (erwartet genau 4)`,
    );
  }
  const [parCol, insCol, apprCol, totCol] = chfIdx;
  // Befund #4 (Bericht): die Kopfzelle "Teilepreis" ist über die Spalte
  // links der ersten CHF-Spalte MIT der CHF-Spalte verbunden (Merge, z. B.
  // 1er F20/F21 Z1:AA1). "ab" steht ausschliesslich in dieser linken Spalte,
  // nie in der CHF-Zelle selbst.
  //
  // Befund #6: die Spalte links der ersten CHF-Spalte ist ohne Prüfung
  // übernommen worden. In anderen Datei-Layouts kann an dieser Position eine
  // interne Kalkulationsspalte (z. B. "Teile", "Komplettpreis") mit
  // numerischen Werten liegen (siehe docs Sonderfälle: "4849.02" in
  // Teile/Komplettpreis bei einer Gruppenzeile) - solche Werte dürfen nie als
  // Preis-Präfix ("ab") interpretiert werden. Nur werten, wenn die Zeile-1-
  // Bezeichnung dieser Spalte "Teilepreis" oder leer ist (Spaltenprüfung,
  // einmalig), UND der Zellwert je Zeile ein kurzer Text ist (kein `number`).
  const pricePrefixCol = parCol - 1;
  const pricePrefixHeaderLabel = pricePrefixCol >= 0 ? trimOrNull(row0[pricePrefixCol]) : null;
  const pricePrefixColValid =
    pricePrefixCol >= 0 && (pricePrefixHeaderLabel === null || pricePrefixHeaderLabel === "Teilepreis");

  // Motorisierungsspalten: zwischen Nummer und der ersten CHF-Spalte, Zeile 2
  // hat Text, Zeile 1 ist nicht in IGNORED_HEADER_LABELS. Zugleich
  // Kraftstoff-Gruppe vorwärts auffüllen.
  interface ModelCol {
    colIdx: number;
    name: string;
    fuel: FuelType;
  }
  const modelCols: ModelCol[] = [];
  let currentFuel: FuelType = null;
  const fuelHeaderCells: { colIdx: number; keyword: NonNullable<FuelType> }[] = [];
  for (let i = numberColIdx + 1; i < chfIdx[0]; i++) {
    const headerLabel = trimOrNull(row0[i]);
    if (headerLabel) {
      const kw = detectFuelKeyword(headerLabel);
      if (kw) {
        currentFuel = kw;
        fuelHeaderCells.push({ colIdx: i, keyword: kw });
      }
    }
    if (headerLabel && IGNORED_HEADER_LABELS.has(headerLabel)) continue;
    const modelName = trimOrNull(row1[i]);
    if (!modelName) continue;
    modelCols.push({ colIdx: i, name: modelName, fuel: currentFuel });
  }
  if (modelCols.length === 0) {
    warnings.push("Keine Motorisierungsspalten gefunden");
  }

  // Befund #6 (Bericht): einzelne Dateien (MINI F60 Countryman) haben
  // denselben Motorisierungsnamen in zwei Spalten (hier "Countryman One" in
  // Benzin- UND Diesel-Spalte), was models unique(family_id, name) bzw.
  // (family_id, slug) verletzen würde und Fitment-Duplikate erzeugt. Bei
  // einer Kollision wird nach Kraftstoff disambiguiert (Fallback: laufende
  // Nummer) und gewarnt; modelCols wird in place angepasst, damit Marker
  // (`marksNames`) und `seriesPsSuggested` denselben, eindeutigen Namen
  // verwenden.
  const modelNameCounts = new Map<string, number>();
  for (const mc of modelCols) modelNameCounts.set(mc.name, (modelNameCounts.get(mc.name) ?? 0) + 1);
  const modelNameSeen = new Map<string, number>();
  for (const mc of modelCols) {
    const total = modelNameCounts.get(mc.name)!;
    if (total < 2) continue;
    const occurrence = (modelNameSeen.get(mc.name) ?? 0) + 1;
    modelNameSeen.set(mc.name, occurrence);
    const original = mc.name;
    const fuelLabel =
      mc.fuel === "benzin" ? "Benzin" : mc.fuel === "diesel" ? "Diesel" : mc.fuel === "elektro" ? "Elektro" : null;
    mc.name = fuelLabel ? `${original} (${fuelLabel})` : `${original} ${occurrence}`;
    warnings.push(
      `Spalte ${mc.colIdx + 1}: Motorisierungsname "${original}" kommt mehrfach vor, disambiguiert zu "${mc.name}"`,
    );
  }

  validateFuelPlausibility(modelCols, fuelHeaderCells, ws, warnings);

  const models: ParsedModel[] = modelCols.map((mc, idx) => ({
    name: mc.name,
    slug: slug(mc.name),
    fuel: mc.fuel,
    sort: idx,
    seriesPsSuggested: [],
  }));

  // -------------------------------------------------------------------
  // Zeilenklassifizierung ab Zeile 3 (Index 2)
  // -------------------------------------------------------------------

  function priceRowValues(row: unknown[]): [unknown, unknown, unknown, unknown] {
    return [row[parCol], row[insCol], row[apprCol], row[totCol]];
  }

  /** Preiswert 0 wird als Datenfehler ignoriert (siehe Warnungen unten). */
  function nullZero(v: unknown): number | string | null {
    if (v === 0) return null;
    if (typeof v === "number" || typeof v === "string") return v;
    return null;
  }

  function rowName(row: unknown[]): { name: string | null; nameB: string | null; nameC: string | null } {
    const nameB = trimOrNull(row[1]);
    const nameC = trimOrNull(row[2]);
    if (nameB && nameC) return { name: `${nameB} ${nameC}`, nameB, nameC };
    if (nameB) return { name: nameB, nameB, nameC: null };
    if (nameC) return { name: nameC, nameB: null, nameC }; // robust: B leer, C hat Inhalt
    return { name: null, nameB: null, nameC: null };
  }

  function isFusszeile(row: unknown[]): boolean {
    const totalRaw = row[totCol];
    if (typeof totalRaw !== "string" || totalRaw.trim() === "") return false;
    return row.every((v, idx) => idx === totCol || v === null || v === undefined || v === "");
  }

  /** Regel 4: kein Name, aber mindestens eine (nach 0-Bereinigung) gefüllte Preiszelle. */
  function isNurPreiseZeile(row: unknown[] | undefined): boolean {
    if (!row || !rowHasContent(row)) return false;
    if (isFusszeile(row)) return false;
    const { name } = rowName(row);
    if (name) return false;
    const [p, ins, appr, tot] = priceRowValues(row).map(nullZero);
    return p !== null || ins !== null || appr !== null || tot !== null;
  }

  interface RowFields {
    name: string | null;
    nameB: string | null;
    rc: string | null;
    articleNo: string | null;
    pricePrefix: string | null;
    marksNames: string[];
    pParts: number | string | null;
    pInstall: number | string | null;
    pApproval: number | string | null;
    pTotal: number | string | null;
    anyPriceFilled: boolean;
    zeroed: boolean;
  }

  /** Alle je Zeile benötigten Felder an einer Stelle extrahiert, damit sie
   * sowohl für die aktuelle Zeile als auch für einen Lookahead auf die
   * Folgezeile (Radsatz-Sonderfall unten) identisch berechnet werden. */
  function extractRowFields(row: unknown[]): RowFields {
    const { name, nameB } = rowName(row);
    const rc = rcIdx >= 0 ? trimOrNull(row[rcIdx]) : null;
    const articleNoRaw = row[numberColIdx];
    const articleNo =
      typeof articleNoRaw === "number" ? String(articleNoRaw) : trimOrNull(articleNoRaw);
    // Befund #4: Präfix-Zelle links der ersten CHF-Spalte ("ab"). Befund #6:
    // nur werten, wenn die Spalte plausibel ist (s. o.) UND der Zellwert ein
    // kurzer Text ist - numerische Werte (interne Kalkulationsspalten) nie
    // als Preis-Präfix interpretieren.
    const rawPricePrefixCell = pricePrefixColValid ? row[pricePrefixCol] : null;
    const pricePrefix =
      typeof rawPricePrefixCell === "string" &&
      rawPricePrefixCell.trim().length > 0 &&
      rawPricePrefixCell.trim().length <= 20
        ? rawPricePrefixCell.trim()
        : null;
    const marksNames = modelCols
      .filter((mc) => trimOrNull(row[mc.colIdx]) === "l")
      .map((mc) => mc.name);
    const rawPriceCells = priceRowValues(row);
    const zeroed = rawPriceCells.some((v) => v === 0);
    const [pParts, pInstall, pApproval, pTotal] = rawPriceCells.map(nullZero);
    const anyPriceFilled = pParts !== null || pInstall !== null || pApproval !== null || pTotal !== null;
    return { name, nameB, rc, articleNo, pricePrefix, marksNames, pParts, pInstall, pApproval, pTotal, anyPriceFilled, zeroed };
  }

  type Kind = "category" | "product" | "group" | "hint" | null;

  const products: ParsedProduct[] = [];
  const notes: ParsedNote[] = [];

  let currentSourceCategory: string | null = null;
  let currentFlowCategory: FlowCategory | null = null;
  let currentGroupLabel: string | null = null;
  let lastKind: Kind = null;
  let currentProduct: ParsedProduct | null = null;
  /** Das Produkt unmittelbar vor currentProduct (nur gesetzt, wenn beide
   * ohne Unterbrechung durch Kategorie/Gruppe/Hinweis aufeinander folgen).
   * Für Befund #3 (Nur-Preise-Zeile, verschobener Total bei Endrohre-Paaren). */
  let previousProduct: ParsedProduct | null = null;
  let currentHint: ParsedNote | null = null;
  let productSort = 0;
  let noteSort = 0;
  /** Befund #7: identische Hinweistexte (z. B. "Adaptersatz inkl.
   * Radschrauben und Nabenkappen", einmal pro Radsatz wiederholt) werden je
   * (family, source_category) nur einmal in notes abgelegt. */
  const noteByKey = new Map<string, ParsedNote>();
  /** Prüfer-Befund #4 (Runde 2): Richtpreis-Betrag je Gutachten-/Garantie-
   * Hinweis, erst NACH Abschluss aller Hinweis-Fortsetzungen an den Text
   * angehängt (siehe Ende der Zeilenschleife) - sonst landet er mitten im
   * (ggf. per Trennstrich umgebrochenen) Fortsetzungstext. */
  const pendingRichtpreis = new Map<ParsedNote, number>();

  function refreshProductDerivedFields(p: ParsedProduct, pParts: unknown, pInstall: unknown, pApproval: unknown, pTotal: unknown) {
    const resolved = computePriceFields(
      pParts as number | string | null,
      pInstall as number | string | null,
      pApproval as number | string | null,
      pTotal as number | string | null,
      null,
    );
    p.pricePartsChf = resolved.pricePartsChf;
    p.priceInstallChf = resolved.priceInstallChf;
    p.priceApprovalChf = resolved.priceApprovalChf;
    p.priceTotalChf = resolved.priceTotalChf;
    p.priceStatus = resolved.priceStatus;
    p.priceNote = resolved.priceNote;
    p.contentHash = computeContentHash(p);
  }

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const excelRow = i + 1;

    // Regel 1: Leer
    if (!rowHasContent(row)) continue;

    // Regel 2: Fusszeile
    if (isFusszeile(row)) continue;

    const { name, nameB, rc, articleNo, pricePrefix, marksNames, pParts, pInstall, pApproval, pTotal, anyPriceFilled, zeroed } =
      extractRowFields(row);
    if (zeroed) {
      warnings.push(`Zeile ${excelRow}: Preiswert 0 ignoriert (vermutlich Datenfehler in Excel)`);
    }

    // Regel 3: Kategorie (nur Spalte B hat Inhalt)
    const onlyColB = row.every((v, idx) => idx === 1 || v === null || v === undefined || v === "");
    if (onlyColB && nameB) {
      const cat = isCategoryRow(nameB);
      if (cat) {
        currentSourceCategory = cat;
        currentFlowCategory = mapSourceCategory(cat);
        currentGroupLabel = null;
        lastKind = "category";
        currentProduct = null;
        previousProduct = null;
        currentHint = null;
        continue;
      }
    }

    // Regel 4: Nur-Preise-Zeile
    if (!name && anyPriceFilled) {
      if (currentProduct) {
        // Overwrite: eine gefüllte Zelle dieser Zeile ersetzt den bisherigen
        // Wert des vorherigen Produkts in derselben Preisspalte (siehe
        // Beispiel ECU-Abdeckung Carbon: füllt bisher leere Zellen).
        //
        // Befund #3 (Bericht): bei den dÄHLer-Endrohre-Paaren (MINI F55/56/57,
        // F65/66/67) steht die Total-Spalte faktisch eine Zeile zu tief: das
        // "2 Endrohre"-Produkt bekommt gar keinen eigenen Total, das
        // "4 Endrohre"-Produkt trägt in seiner eigenen Zeile den Total des
        // Vorprodukts (Teile+Montage des Vorprodukts == dieser Total), und
        // diese Nur-Preise-Zeile trägt den eigentlichen Total des "4
        // Endrohre"-Produkts. Erkennung über die Summenprobe Teile+Montage
        // (+Gutachten) == Total: passt der bereits gesetzte Total NICHT zur
        // eigenen Zeile, aber exakt zur Summe des Vorprodukts (das noch
        // keinen Total hat), gehört er dorthin; der neue Wert dieser Zeile
        // gehört dann dem aktuellen Produkt.
        const nextParts = pParts !== null ? pParts : currentProduct.pricePartsChf;
        const nextInstall = pInstall !== null ? pInstall : currentProduct.priceInstallChf;
        const nextApproval = pApproval !== null ? pApproval : currentProduct.priceApprovalChf;
        let nextTotal = pTotal !== null ? pTotal : currentProduct.priceTotalChf;

        if (pTotal !== null && typeof currentProduct.priceTotalChf === "number") {
          const ownSum =
            (currentProduct.pricePartsChf ?? 0) +
            (currentProduct.priceInstallChf ?? 0) +
            (currentProduct.priceApprovalChf ?? 0);
          const ownSumMatches = ownSum > 0 && ownSum === currentProduct.priceTotalChf;
          if (!ownSumMatches && previousProduct && previousProduct.priceTotalChf === null) {
            const prevSum =
              (previousProduct.pricePartsChf ?? 0) +
              (previousProduct.priceInstallChf ?? 0) +
              (previousProduct.priceApprovalChf ?? 0);
            if (prevSum > 0 && prevSum === currentProduct.priceTotalChf) {
              warnings.push(
                `Zeile ${excelRow}: Total ${currentProduct.priceTotalChf} aus Zeile ${currentProduct.sourceRow} gehört rechnerisch zum vorherigen Produkt "${previousProduct.name}" (Zeile ${previousProduct.sourceRow}, Teile+Montage[+Gutachten] = Total), automatisch korrigiert`,
              );
              refreshProductDerivedFields(
                previousProduct,
                previousProduct.pricePartsChf,
                previousProduct.priceInstallChf,
                previousProduct.priceApprovalChf,
                currentProduct.priceTotalChf,
              );
              nextTotal = pTotal;
            } else {
              warnings.push(
                `Zeile ${excelRow}: Nur-Preise-Zeile überschreibt bereits gesetzten Total (${currentProduct.priceTotalChf} -> ${pTotal}) von Zeile ${currentProduct.sourceRow}`,
              );
            }
          } else if (pTotal !== currentProduct.priceTotalChf) {
            warnings.push(
              `Zeile ${excelRow}: Nur-Preise-Zeile überschreibt bereits gesetzten Total (${currentProduct.priceTotalChf} -> ${pTotal}) von Zeile ${currentProduct.sourceRow}`,
            );
          }
        }

        refreshProductDerivedFields(currentProduct, nextParts, nextInstall, nextApproval, nextTotal);
      } else {
        warnings.push(`Zeile ${excelRow}: Nur-Preise-Zeile ohne vorheriges Produkt, ignoriert`);
      }
      continue;
    }

    // Befund #1 (Bericht): Gutachten-/Garantie-Hinweiszeilen sind IMMER ein
    // Hinweis, auch wenn eine Preiszelle gefüllt ist (siehe Regel-Erklärung
    // bei isGutachtenOderGarantieHinweis). Muss vor Regel 5 geprüft werden.
    if (name && isGutachtenOderGarantieHinweis(name)) {
      const amount =
        typeof pApproval === "number" ? pApproval : typeof pTotal === "number" ? pTotal : null;
      // Prüfer-Befund #4 (Runde 2): Richtpreis NICHT sofort anhängen - die
      // Hinweis-Fortsetzungen (weiter unten) sind an dieser Stelle noch
      // nicht bekannt und würden sonst mitten in den fertigen Text
      // geschrieben. Betrag merken, erst am Ende der Zeilenschleife anhängen.
      const note: ParsedNote = {
        sourceCategory: currentSourceCategory ?? "",
        text: name,
        sort: noteSort++,
      };
      notes.push(note);
      noteByKey.set(`${currentSourceCategory ?? ""}|${name}`, note);
      if (amount !== null) pendingRichtpreis.set(note, Math.round(amount));
      currentHint = note;
      lastKind = "hint";
      currentProduct = null;
      previousProduct = null;
      continue;
    }

    // Excel-Eigenheit (nicht in docs/excel-import.md beschrieben): Zeilen
    // ganz ohne Name und ohne Preis kann keine der acht dokumentierten
    // Regeln zuordnen (3/5/6/7/8 brauchen einen Namen, 4 braucht einen
    // Preis) - unabhängig davon, ob noch ein verwaister RC-Buchstabe, eine
    // Artikelnummer wie "." oder einzelne Motorisierungs-Marker ('l') in
    // der Zeile stehen (vermutlich Restzeilen aus Kopieren/Einfügen).
    // Überspringen statt als "nicht klassifizierbar" zu melden; nur bei
    // vorhandenen Markern eine Warnung, da das auf eine verwaiste
    // Fitment-Angabe hindeuten kann.
    if (!name && !anyPriceFilled) {
      if (marksNames.length > 0) {
        warnings.push(
          `Zeile ${excelRow}: Marker ohne Name/Preis gefunden, ignoriert (vermutlich Excel-Restzeile)`,
        );
      }
      continue;
    }

    // Lookahead: wird die nächste Zeile eine Nur-Preise-Zeile sein, die sich
    // an DIESE Zeile anhängt? (Beispiel M2 G87 "ECU-Abdeckung in Carbon").
    const forcedProduct = !!name && !anyPriceFilled && isNurPreiseZeile(rows[i + 1]);

    // Ergänzung Prüfung Phase B, Punkt 8b: Zeile beginnt mit "Distanzscheiben"
    // oder "dÄHLer Endrohre", hat weder RC noch Artikelnummer noch Marker,
    // und die EINZIGE gefüllte Preiszelle ist Text (kein numerischer Preis,
    // auch keine Apostroph-Zahl) -> Gruppenzeile (Regel 6), nicht Produkt
    // (Regel 5). Muss VOR Regel 5 geprüft werden: ein Textwert in pParts/
    // pTotal löst dort sonst über priceSignal fälschlich ein "Produkt" ohne
    // echten Preis aus (Beispiel, echte Zeile XM G09.xls: "Distanzscheiben
    // (schwarz) Satz i.V. mit BMW Serien- od. M Performance Räder", einzige
    // Preiszelle "in Vorb."). specialGroupPrefix (Regel 6 weiter unten) deckt
    // nur den Fall OHNE jede gefüllte Preiszelle ab.
    const resolvedPriceCells = [pParts, pInstall, pApproval, pTotal].map(resolvePriceCell);
    const filledPriceCells = resolvedPriceCells.filter((c) => c.num !== null || c.text !== null);
    const onlyPriceCellIsText = filledPriceCells.length === 1 && filledPriceCells[0].text !== null;
    const distanzscheibenEndrohreTextGroup =
      !!name &&
      !rc &&
      !articleNo &&
      marksNames.length === 0 &&
      onlyPriceCellIsText &&
      (name.startsWith("dÄHLer Endrohre") || name.startsWith("Distanzscheiben"));
    if (distanzscheibenEndrohreTextGroup) {
      warnings.push(
        `Zeile ${excelRow}: "${name}" beginnt mit "Distanzscheiben"/"dÄHLer Endrohre" und trägt nur Text ("${filledPriceCells[0]!.text}") in einer Preiszelle, als Gruppenzeile statt als Produkt behandelt.`,
      );
      currentGroupLabel = name;
      lastKind = "group";
      currentProduct = null;
      previousProduct = null;
      currentHint = null;
      continue;
    }

    // Regel 5: Produkt. Befund #4: die "ab"-Präfixzelle zählt zusätzlich als
    // "price_parts gefüllt".
    const priceSignal = pTotal !== null || pParts !== null || pricePrefix !== null;
    if (name && currentFlowCategory && (priceSignal || forcedProduct)) {
      const perf = parsePerformance(name);
      if (perf.warning) warnings.push(`Zeile ${excelRow}: ${perf.warning}`);
      const fitsAll = marksNames.length === 0;
      const resolved = computePriceFields(pParts, pInstall, pApproval, pTotal, pricePrefix);
      if (resolved.totalOnlyPartialSum) {
        warnings.push(
          `Zeile ${excelRow}: Total (${resolved.priceTotalChf}) enthält nur Teilbeträge, da Teilepreis Text ist ("${name}")`,
        );
      }
      const product: ParsedProduct = {
        sourceRow: excelRow,
        sort: productSort++,
        sourceCategory: currentSourceCategory ?? "",
        category: currentFlowCategory,
        groupLabel: resolveGroupLabel(currentGroupLabel, currentFlowCategory, name),
        name,
        description: null,
        articleNo,
        rc,
        pricePartsChf: resolved.pricePartsChf,
        priceInstallChf: resolved.priceInstallChf,
        priceApprovalChf: resolved.priceApprovalChf,
        priceTotalChf: resolved.priceTotalChf,
        priceStatus: resolved.priceStatus,
        priceNote: resolved.priceNote,
        psBase: perf.psBase,
        psTo: perf.psTo,
        nmTo: perf.nmTo,
        variantGroup: variantGroupFor(currentFlowCategory, name),
        gearbox: gearboxFor(name),
        fits: fitsAll ? [] : marksNames,
        fitsAll,
        contentHash: "",
      };
      product.contentHash = computeContentHash(product);
      // Prüfer-Befund #2 (Runde 2): Text entspricht einem der in
      // docs/excel-import.md als Gruppenzeilen-Beispiel genannten Muster
      // ("DME Leistungssteigerungen:", "DDE Leistungssteigerungen
      // Dieselmotoren:", ...) und endet auf ":", trägt hier aber
      // ausnahmsweise Marker/Preis (X3 G45 Z11: RC E, Marker 20d, "in
      // Vorb."). Regel 5 hat Vorrang vor Regel 6 (Doku-Reihenfolge), die
      // Zeile wird deshalb korrekt als Produkt behandelt - das ist aber
      // unüblich genug, um es dem Kunden als Datenfehler zu melden.
      if (name.endsWith(":") && GROUP_LABEL_LIKE_PREFIXES.some((re) => re.test(name))) {
        warnings.push(
          `Datenfehler in der Excel (dem Kunden melden): Zeile ${excelRow}: Gruppenzeile mit Marker/Preis ("${name}") - entspricht einem dokumentierten Gruppenzeilen-Muster, trägt hier aber Marker und/oder Preis und wird deshalb (Regel 5 vor Regel 6) als eigenes Produkt behandelt.`,
        );
      }
      products.push(product);
      lastKind = "product";
      previousProduct = currentProduct;
      currentProduct = product;
      currentHint = null;
      continue;
    }
    if (name && !currentFlowCategory && (priceSignal || forcedProduct)) {
      warnings.push(`Zeile ${excelRow}: Produkt ohne bekannte Kategorie, ignoriert ("${name}")`);
      lastKind = null;
      currentProduct = null;
      previousProduct = null;
      currentHint = null;
      continue;
    }

    // Sonderfall Radsatz-Block, nicht in docs/excel-import.md beschrieben
    // (Prüfbericht Modul Parser, Befund 1): "<...> Radsatz ... bestehend
    // aus:" ohne eigenen Preis, unmittelbar gefolgt von der Dimensionszeile
    // (beginnt mit einer Ziffer, z. B. "9 x 20\" mit 245/45 20"), die den
    // Preis trägt. Normalerweise (Doku, Regel 6) trägt genau diese Zeile
    // selbst den Preis und wird direkt über Regel 5 zum Produkt; in einer
    // Minderheit der Radsatz-Blöcke (X3 G01/X4 G02, X5 G05/X6 G06,
    // X5M F95 LCI/X6M F96 LCI, X7 G07, XM G09) steht der Preis stattdessen
    // auf der Dimensionszeile - RC/Artikelnummer/Marker sind mal auf der
    // einen, mal auf der anderen Zeile verteilt (beide Varianten kommen
    // vor). Ohne Sonderbehandlung würde Regel 6 diese Zeile zur
    // Gruppenzeile machen, die Dimensionszeile würde über Regel 5 fälschlich
    // selbst zum Produkt (Name nur die Dimension, z. B. "9 x 20\" mit
    // 245/45 20" statt "CDC1 FORGED Radsatz bestehend aus:") und
    // group_label würde mangels Reset an alle nachfolgenden
    // Zubehör-Produkte der Kategorie (Adaptersatz, Aufpreis Lackierung,
    // RDCi-Sensoren, Mobility-System, bei XM G09 auch Distanzscheiben)
    // vererbt. Deshalb: die "bestehend aus:"-Zeile wird selbst zum Produkt
    // (Name), RC/Artikelnummer/Marker/Preis werden aus beiden Zeilen
    // zusammengeführt (je die gefüllte Zelle gewinnt, Preis kommt zwingend
    // von der Dimensionszeile, da die Gruppenzeile laut Bedingung keinen
    // hat), die Dimensionszeile wird zur ersten Beschreibungszeile
    // (weitere Grössen folgen wie gewohnt über Regel 7). group_label bleibt
    // unverändert (wird NICHT auf diese Zeile gesetzt) - das verhindert die
    // Vererbung an die nachfolgenden Zubehör-Produkte. Muss vor Regel 5b
    // geprüft werden, sonst nimmt Regel 5b Zeilen mit Artikelnummer auf der
    // Gruppenzeile (X5 G05/X6 G06) vorweg.
    const radsatzBestehendAusOhnePreis =
      !!name && !anyPriceFilled && /Radsatz.*bestehend aus:$/i.test(name);
    if (radsatzBestehendAusOhnePreis && currentFlowCategory) {
      const nextRow = rows[i + 1];
      if (nextRow && rowHasContent(nextRow) && !isFusszeile(nextRow)) {
        const nf = extractRowFields(nextRow);
        if (nf.name && /^\d/.test(nf.name) && (nf.anyPriceFilled || nf.pricePrefix !== null)) {
          if (nf.zeroed) {
            warnings.push(
              `Zeile ${excelRow + 1}: Preiswert 0 ignoriert (vermutlich Datenfehler in Excel)`,
            );
          }
          const perf = parsePerformance(name);
          if (perf.warning) warnings.push(`Zeile ${excelRow}: ${perf.warning}`);
          const mergedRc = rc ?? nf.rc;
          const mergedArticleNo = articleNo ?? nf.articleNo;
          const mergedMarks = marksNames.length > 0 ? marksNames : nf.marksNames;
          const fitsAll = mergedMarks.length === 0;
          const resolved = computePriceFields(nf.pParts, nf.pInstall, nf.pApproval, nf.pTotal, nf.pricePrefix);
          const product: ParsedProduct = {
            sourceRow: excelRow,
            sort: productSort++,
            sourceCategory: currentSourceCategory ?? "",
            category: currentFlowCategory,
            groupLabel: resolveGroupLabel(currentGroupLabel, currentFlowCategory, name),
            name,
            description: nf.name,
            articleNo: mergedArticleNo,
            rc: mergedRc,
            pricePartsChf: resolved.pricePartsChf,
            priceInstallChf: resolved.priceInstallChf,
            priceApprovalChf: resolved.priceApprovalChf,
            priceTotalChf: resolved.priceTotalChf,
            priceStatus: resolved.priceStatus,
            priceNote: resolved.priceNote,
            psBase: perf.psBase,
            psTo: perf.psTo,
            nmTo: perf.nmTo,
            variantGroup: variantGroupFor(currentFlowCategory, name),
            gearbox: gearboxFor(name),
            fits: fitsAll ? [] : mergedMarks,
            fitsAll,
            contentHash: "",
          };
          product.contentHash = computeContentHash(product);
          warnings.push(
            `Zeile ${excelRow}: "${name}" trägt keinen eigenen Preis, Preis (und ggf. RC/Artikelnummer/Marker) aus Zeile ${excelRow + 1} ("${nf.name}") übernommen (Excel-Layoutfehler im Radsatz-Block, nicht in docs/excel-import.md beschrieben)`,
          );
          products.push(product);
          lastKind = "product";
          previousProduct = currentProduct;
          currentProduct = product;
          currentHint = null;
          i++;
          continue;
        }
      }
    }

    // Regel 5b: Produkt ohne Preisangabe, aber mit Artikelnummer (nicht 77
    // Gutachten / 777 Garantie - die sind immer Hinweise, Regel 8). Beispiele
    // MINI F60: "Adaptersatz inkl. Radschrauben und Nabenkappen" (36 F60 xxx),
    // "Edelstahlauspuffanlage" (18 xxx). price_status immer on_request,
    // price_note "ohne Preisangabe".
    if (name && !anyPriceFilled && articleNo && articleNo !== "77" && articleNo !== "777") {
      if (!currentFlowCategory) {
        warnings.push(`Zeile ${excelRow}: Produkt ohne bekannte Kategorie, ignoriert ("${name}")`);
        lastKind = null;
        currentProduct = null;
        previousProduct = null;
        currentHint = null;
        continue;
      }
      const perf = parsePerformance(name);
      if (perf.warning) warnings.push(`Zeile ${excelRow}: ${perf.warning}`);
      const fitsAll = marksNames.length === 0;
      const product: ParsedProduct = {
        sourceRow: excelRow,
        sort: productSort++,
        sourceCategory: currentSourceCategory ?? "",
        category: currentFlowCategory,
        groupLabel: resolveGroupLabel(currentGroupLabel, currentFlowCategory, name),
        name,
        description: null,
        articleNo,
        rc,
        pricePartsChf: null,
        priceInstallChf: null,
        priceApprovalChf: null,
        priceTotalChf: null,
        priceStatus: "on_request",
        priceNote: "ohne Preisangabe",
        psBase: perf.psBase,
        psTo: perf.psTo,
        nmTo: perf.nmTo,
        variantGroup: variantGroupFor(currentFlowCategory, name),
        gearbox: gearboxFor(name),
        fits: fitsAll ? [] : marksNames,
        fitsAll,
        contentHash: "",
      };
      product.contentHash = computeContentHash(product);
      warnings.push(
        `Zeile ${excelRow}: Produkt ohne Preisangabe ("${name}", Artikelnummer "${articleNo}"), price_status on_request`,
      );
      products.push(product);
      lastKind = "product";
      previousProduct = currentProduct;
      currentProduct = product;
      currentHint = null;
      continue;
    }

    // Regel 6: Gruppenzeile
    const endsColon = !!name && name.endsWith(":");
    const specialGroupPrefix =
      !!name &&
      !anyPriceFilled &&
      !rc &&
      marksNames.length === 0 &&
      (name.startsWith("dÄHLer Endrohre") || name.startsWith("Distanzscheiben")) &&
      (lastKind === "category" || lastKind === "product" || lastKind === "hint");
    // Erweiterte Regel 6: Gruppenzeilen ohne Doppelpunkt, die weder mit
    // "dÄHLer Endrohre" noch "Distanzscheiben" beginnen - Text beginnt mit
    // "DME"/"DDE" (Toyota: "DME Leistungssteigerungen «powered by dÄHLer»",
    // ohne Doppelpunkt), oder die Zeile steht direkt nach einer
    // Kategoriezeile und hat weder RC noch Artikelnummer noch Marker noch
    // Preis.
    const dmeDdePrefix = !!name && !anyPriceFilled && /^(DME|DDE)\b/i.test(name);
    const afterCategoryNoSignal =
      !!name && !anyPriceFilled && !rc && !articleNo && marksNames.length === 0 && lastKind === "category";
    if (
      name &&
      !anyPriceFilled &&
      (endsColon || specialGroupPrefix || dmeDdePrefix || afterCategoryNoSignal)
    ) {
      currentGroupLabel = name;
      lastKind = "group";
      currentProduct = null;
      previousProduct = null;
      currentHint = null;
      continue;
    }

    // Regel 7: Fortsetzung (an Produkt)
    const noRc = !rc;
    const noArticleNo = !articleNo;
    const noMarks = marksNames.length === 0;
    if (name && !anyPriceFilled && noRc && noArticleNo && noMarks && lastKind === "product" && currentProduct) {
      // Prüfer-Befund #2 (Runde 2): Produktname endet auf ":" (Regel-6-
      // artiges Muster wie "Leistungssteigerung Stufe 1:") und die
      // Fortsetzung beginnt mit "(Basis" (M3 F80/M4 F82 Z9-10, X3 G45
      // Z11-12) - gehört zum Namen, sonst gehen psBase/psTo/nmTo verloren
      // (parsePerformance läuft nur über den Namen, nie über description).
      const basisContinuation = currentProduct!.name.endsWith(":") && /^\(Basis/i.test(name);
      const appendToName =
        basisContinuation ||
        NAME_CONTINUATION_SUFFIXES.some((suf) => currentProduct!.name.endsWith(suf)) ||
        isLowercaseStart(name);
      if (appendToName) {
        // Trennstrich-Umbruch (Befund #2/#4): "Leistungs-" + "steigerungen"
        // -> "Leistungssteigerungen", gilt auch für Namen.
        currentProduct.name = joinContinuationText(currentProduct.name, name, " ");
        // Leistungsdaten und variant_group nach jeder Namenserweiterung neu
        // aus dem vollständigen Namen ableiten (Regel 5, "aus dem Namen").
        const perf = parsePerformance(currentProduct.name);
        if (perf.warning) warnings.push(`Zeile ${excelRow}: ${perf.warning}`);
        currentProduct.psBase = perf.psBase;
        currentProduct.psTo = perf.psTo;
        currentProduct.nmTo = perf.nmTo;
        currentProduct.variantGroup = variantGroupFor(currentProduct.category, currentProduct.name);
        currentProduct.gearbox = gearboxFor(currentProduct.name);
        currentProduct.contentHash = computeContentHash(currentProduct);
      } else {
        currentProduct.description = currentProduct.description
          ? joinContinuationText(currentProduct.description, name, "\n")
          : name;
        currentProduct.contentHash = computeContentHash(currentProduct);
      }
      continue;
    }

    // Verwaiste Marker-Zeilen (docs/excel-import.md): benannte Zeilen ohne
    // Preis, mit Marker, ohne Artikelnummer (Zeilen mit einer echten,
    // nicht-77/777-Artikelnummer sind bereits über Regel 5b als eigenes
    // Produkt behandelt). Ausnahme laut Doku: Name entspricht exakt dem
    // Vorprodukt -> zusätzliche Fitments des Vorprodukts, IMMER mit Warnung
    // (Befund #5). Beginnt die Zeile mit einer Ziffer (Radsatz-
    // Grössenangabe), gehört sie an die Beschreibung des Vorprodukts (Regel
    // 7, hier ohne die dortige noMarks-Bedingung). In allen anderen Fällen
    // gibt es dafür keine eigene Regel mehr (die frühere Sonderbehandlung
    // "verwerfen" war nicht dokumentiert) - die Zeile fällt durch auf Regel
    // 8 (Hinweis), wie jede andere unklassifizierbare benannte Zeile auch.
    if (name && !anyPriceFilled && !articleNo && marksNames.length > 0) {
      if (lastKind === "product" && currentProduct && currentProduct.name === name) {
        const merged = new Set([...currentProduct.fits, ...marksNames]);
        currentProduct.fits = [...merged];
        currentProduct.fitsAll = currentProduct.fits.length === 0;
        currentProduct.contentHash = computeContentHash(currentProduct);
        warnings.push(
          `Zeile ${excelRow}: zusätzliche Fitments ("${marksNames.join(", ")}") für Vorprodukt "${name}" übernommen (stille Fitment-Erweiterung)`,
        );
        continue;
      }
      if (lastKind === "product" && currentProduct && /^\d/.test(name)) {
        currentProduct.description = currentProduct.description
          ? joinContinuationText(currentProduct.description, name, "\n")
          : name;
        currentProduct.contentHash = computeContentHash(currentProduct);
        continue;
      }
      // Kein Match: fällt bewusst durch (kein `continue`) auf die
      // Hinweis-Fortsetzung bzw. Regel 8 weiter unten.
    }

    // Hinweis-Fortsetzung (parallel zu Regel 7, siehe Regel 8: Folgezeilen
    // ohne RC/Marker/Preis hängen an den Hinweis an, weil Regel 7 nicht greift).
    if (name && !anyPriceFilled && noRc && noArticleNo && noMarks && lastKind === "hint" && currentHint) {
      // Prüfer-Befund #4 (Runde 2)/Befund #2: Trennstrich-Zeilenumbruch (z. B.
      // "Leistungs-" / "steigerungen", "Typen-" / "genehmigungsnummer") ohne
      // Leerzeichen verbinden und Trennstrich entfernen, sonst entsteht
      // "Leistungs- steigerungen" bzw. "Leistungs-steigerungen".
      currentHint.text = joinContinuationText(currentHint.text, name, " ");
      continue;
    }

    // Regel 8: Hinweis. Befund #7: identischer Text innerhalb derselben
    // Kategorie wird nur einmal gespeichert (siehe seenNoteKeys oben), statt
    // bei jeder Wiederholung in der Rohdatei eine neue Note anzulegen.
    if (name) {
      const key = `${currentSourceCategory ?? ""}|${name}`;
      const existing = noteByKey.get(key);
      if (existing) {
        currentHint = existing;
      } else {
        const note: ParsedNote = {
          sourceCategory: currentSourceCategory ?? "",
          text: name,
          sort: noteSort++,
        };
        notes.push(note);
        noteByKey.set(key, note);
        currentHint = note;
      }
      lastKind = "hint";
      currentProduct = null;
      previousProduct = null;
      continue;
    }

    // Sollte nach obigen Regeln nicht mehr erreicht werden.
    warnings.push(`Zeile ${excelRow}: konnte keiner Regel zugeordnet werden, ignoriert`);
  }

  // Prüfer-Befund #4 (Runde 2): Richtpreis-Zusatz erst jetzt anhängen, alle
  // Hinweis-Fortsetzungen sind an dieser Stelle bereits im Text (siehe
  // pendingRichtpreis oben).
  for (const [note, amount] of pendingRichtpreis) {
    note.text = `${note.text} (Richtpreis CHF ${amount})`;
  }

  // seriesPsSuggested je Modell: sortierte, eindeutige psBase-Werte aller
  // Leistungsprodukte (variantGroup === 'leistung'), die das Modell fitten.
  for (const model of models) {
    const values = new Set<number>();
    for (const p of products) {
      if (p.variantGroup !== "leistung") continue;
      const fits = p.fitsAll || p.fits.includes(model.name);
      if (!fits) continue;
      for (const v of p.psBase) values.add(v);
    }
    model.seriesPsSuggested = [...values].sort((a, b) => a - b);
  }

  // Befund #3: Summenprüfung Total = Teile + Montage + Gutachten als
  // Plausibilitätswarnung (kein automatischer Eingriff, nur Meldung -
  // Abweichungen kommen in der Praxis auch legitim vor, z. B. Distanzscheiben
  // mit im Total enthaltener, nicht separat ausgewiesener Montage).
  for (const p of products) {
    if (p.priceStatus !== "priced" || p.priceTotalChf === null) continue;
    const sum = (p.pricePartsChf ?? 0) + (p.priceInstallChf ?? 0) + (p.priceApprovalChf ?? 0);
    if (Math.abs(sum - p.priceTotalChf) > 1) {
      warnings.push(
        `Zeile ${p.sourceRow}: Total (${p.priceTotalChf}) weicht von Teile+Montage+Gutachten (${sum}) ab ("${p.name}")`,
      );
    }
  }

  // Befund #2: Dubletten im content_hash innerhalb der Familie disambiguieren.
  disambiguateDuplicateHashes(products, warnings);

  return {
    name: familyName,
    slug: slug(familyName),
    brand,
    codes,
    pricelistNo,
    sourceFile,
    models,
    products,
    notes,
    warnings,
  };
}

export async function parseFile(path: string): Promise<ParsedFamily> {
  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");
  const buf = await readFile(path);
  return parseWorkbook(buf, basename(path));
}
