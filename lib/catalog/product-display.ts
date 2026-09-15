// Abgeleitete Produkttitel für Kundenanzeigen. Siehe CLAUDE.md Abschnitt
// "AUFGABE", Punkt 1: im Motor-Schritt sind zwei Leistungsstufen-Kacheln
// wie «STUFE 1: (BASIS 460 PS) 590PS / 720NM (M6 & A8-GETRIEBE)» und
// «... 610PS / 750NM (...) INKL. ANHEBUNG DER V/MAX BEGRENZUNG» nicht
// unterscheidbar (die Basis-Angabe verdeckt den eigentlichen Unterschied).
// productDisplay() leitet aus dem rohen Excel-Produktnamen einen kurzen,
// unterscheidbaren Titel plus Nebenwerte ab, ohne den gespeicherten Namen
// selbst zu verändern (der bleibt die Originalquelle, siehe
// lib/pricelist/parser.ts und "Nach allem: npm run import ... -> unchanged").
//
// Reine Funktion: kein DB-/Netzwerkzugriff, keine React-Hooks - kann sowohl
// aus components/flow/** (Client) als auch aus lib/mail/templates/*.ts,
// lib/draft/template.ts, lib/inquiry/summary.ts (Server) verwendet werden.
import type { Locale } from "@/lib/i18n/dictionaries";

export interface ProductDisplayInput {
  name: string;
  description?: string | null;
  variant_group?: string | null;
  ps_to?: number | null;
  nm_to?: number | null;
  ps_base?: number[];
}

export interface ProductDisplay {
  /** Kurzer, unterscheidbarer Titel ("Stufe 1", "Stufe 1 mit V/max-Aufhebung", "Leistungssteigerung", oder der Produktname). */
  title: string;
  /** Preisnahe Nebenzeile: "590 PS / 720 Nm" bei Leistungsstufen, sonst die erste Beschreibungszeile. */
  subtitle: string;
  /** Restinformation, klein: z.B. "M6 & A8-Getriebe", "B58 ab 11/2020 (Mild-Hybrid)", oder weitere Beschreibungszeilen. */
  detail: string;
}

const STAGE_NUMBER_PATTERN = /Stufe\s*(\d+)/i;
// Nachzug Prüfung Phase D, Punkt 3: EINE Quelle für das V/max-Muster statt
// zwei leicht unterschiedlicher Varianten. Die bisherige Titel-Erkennung
// (`/V.?max/i`, `.` als Wildcard) erkannte "V-max" zwar schon zufällig mit,
// aber die Detail-Bereinigung weiter unten (VMAX_LIFT_THEN_MENTION_PATTERN/
// VMAX_MENTION_THEN_LIFT_PATTERN) verwendete eine ENGERE Zeichenklasse ohne
// Bindestrich (`V[\s./]?max\.?`) - "V-max." (z.B. M3/M4 G80 "Stufe 1: (Basis
// 480 PS) 650PS / 750Nm ( M6 & A8-Getriebe ) inkl. V-max. Aufhebung") wurde
// dort NICHT erkannt und blieb als Rest-Text ("inkl. V-max. Aufhebung") in
// der Detailzeile sichtbar, obwohl der Titel-Zusatz bereits korrekt gesetzt
// war. Deckt "V-max", "Vmax", "V/max", "V/max.", "V max" einheitlich ab.
const VMAX_CORE_PATTERN = /V[/-]?\s?max\.?/i;
const VMAX_MENTION_PATTERN = VMAX_CORE_PATTERN;
const VMAX_LIFT_PATTERN = /Aufheb|Anheb|inkl/i;

// Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 1): "Aufhebung der
// serienmässigen V/max Begrenzung OHNE Leistungssteigerung" (M2 F87, M3/M4
// G80) liegt bewusst in variant_group "leistung" (siehe
// lib/catalog/variant-groups.ts, motor-Regel: Exklusivität zu einer Stufe
// ist hier gewollt), ist aber ausdrücklich KEINE Leistungsstufe - Titel
// "Stufe N"/"Leistungssteigerung" (+ V/max-Zusatz) wäre hier falsch, und die
// Kachel gehört auch nicht unter die Zwischenüberschrift "Leistungsstufen"
// (components/flow/steps/CategoryStep.tsx motorSubsectionId() prüft
// dasselbe Muster). Rein namensbasiert erkannt (nicht z.B. über ps_to ===
// null: mehrere echte, noch unbepreiste Stufen-Platzhalter haben ebenfalls
// ps_to === null und sollen weiterhin "Stufe N"/"Leistungssteigerung"
// heissen).
const STANDALONE_VMAX_PATTERN = /ohne\s+Leistungssteigerung/i;

/** true für ein eigenständiges V/max-Produkt ohne eigene Leistungssteigerung (siehe STANDALONE_VMAX_PATTERN oben). */
export function isStandaloneVmaxProduct(name: string): boolean {
  return STANDALONE_VMAX_PATTERN.test(name);
}

// Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 6): mehrere
// Leistungsstufen tragen identische PS/Nm-Werte innerhalb desselben Modells
// und unterscheiden sich nur noch durch eine Bauzeitangabe im Namen (z.B.
// «... 380 PS / 780 Nm ab 10.20» vs. «... ab 10.21»). Die Angabe stand vor
// der Kürzung nur noch in der (kleinen) Detailzeile, im PS-Zähler/Upsell
// (nur Titel, siehe CategoryStep displayTitle()) gar nicht mehr sichtbar -
// deshalb zusätzlich in den Titel gezogen. Deckt "ab"/"bis" gefolgt von
// MM.JJ, MM.JJJJ, MM/JJJJ ab, optional mit Bereichsende ("ab 9.20 - 8.22").
const BUILD_DATE_PATTERN = /\b(?:ab|bis)\.?\s*\d{1,2}[./]\d{2,4}(?:\s*-\s*\d{1,2}[./]\d{2,4})?\b/i;

// Dieselbe PS/Nm-Zahlenform wie lib/pricelist/parser.ts parsePerformance()
// (Regel 5, "Leistungsdaten aus dem Namen"), hier zum Entfernen aus dem
// Namen statt zum Auslesen: die Basis-Klammer ist zu diesem Zeitpunkt schon
// entfernt (siehe cleanDetail unten), deshalb reicht das einfache primäre
// Muster ohne die dortige Bereichs-Sonderbehandlung.
const PS_NM_PATTERN = /(\d[\d']*)?\*?\s*PS\s*\/\s*(?:\d[\d']*\s*-\s*)?(\d[\d']*)?\*?\s*Nm/i;
const BASIS_PATTERN = /\(Basis[^)]*\)/gi;
// Nicht an den Namensanfang verankert: in einem Teil der Preislisten steht
// die Basis-Klammer VOR "Stufe N:" (z.B. "(Basis 360 PS) Stufe 1: 422PS /
// 600 Nm B58 ..."), in anderen (M2 G87) dahinter ("Stufe 1: (Basis 460
// PS) ...") - die Reihenfolge ist nicht einheitlich.
// Nachzug Prüfung Phase D, Punkt 3: "Leistungssteigerung " direkt vor
// "Stufe N" wird zusammen mit dem Stufen-Präfix entfernt (reale Namen 1er M
// E82: "Leistungssteigerung Stufe 1 (380PS/520Nm) mit Vmax-Aufhebung") -
// sonst blieb das Wort als Rest in der Detailzeile stehen, obwohl es
// bereits im Titel ("Stufe 1") steckt. Der fallende Fall ganz ohne
// Stufennummer (Titel fällt auf STRINGS.increase "Leistungssteigerung"
// zurück) wird separat in stageDisplay() behandelt (dort ist die
// Stufennummer bereits bekannt, hier nicht).
const STAGE_PREFIX_PATTERN = /(Leistungssteigerung\s+)?Stufe\s*\d+\s*:?/gi;
// Der V/max-Zusatz kommt in den Preislisten in zwei Wortstellungen vor
// (Lift-Wort vor oder nach der V/max-Nennung, mit wechselnden Abkürzungen:
// "Aufhebung"/"Anhebung"/"Aufh."/"Anheb.", "Begrenzung"/"Begr.", "V/max"/
// "V/max."/"Vmax"/"V-max.") - z.B. "inkl. Anhebung der V/max Begrenzung"
// (M2 G87), "inkl. Aufh. der V/max Begr." (M5 F10 N63Tü), "inkl. V/max.
// Aufhebung" (3er/1er B58), "inkl. anhebung V/max." (1er/2er B48), "inkl.
// V-max. Aufhebung" (M3/M4 G80), "mit Vmax-Aufhebung" (1er M E82, Bindestrich
// statt Leerzeichen vor dem Lift-Wort). Wird bereits als Zusatz im Titel
// abgebildet (title-Suffix unten), soll deshalb nicht nochmals als
// Detail-Text auftauchen. Zwei Muster für die beiden Wortstellungen, da eine
// einzelne, beide Reihenfolgen abdeckende Regex kaum noch lesbar wäre; beide
// nutzen denselben VMAX_CORE_PATTERN wie die Titel-Erkennung oben (Punkt 3:
// "gleich behandeln"), statt einer eigenen, abweichenden Zeichenklasse.
const VMAX_LIFT_THEN_MENTION_PATTERN = new RegExp(
  String.raw`\b(inkl\.?\s+)?(Aufhebung|Anhebung|Aufh\.|Anheb\.)\s+(der\s+)?(serienmässigen\s+)?${VMAX_CORE_PATTERN.source}\s*(Begrenzung|Begr\.)?`,
  "gi",
);
const VMAX_MENTION_THEN_LIFT_PATTERN = new RegExp(
  // "mit" zusätzlich zu "inkl." als Lead-in ("mit Vmax-Aufhebung", 1er M
  // E82), "[\s-]*" statt "\s*" vor dem Lift-Wort deckt den Bindestrich-
  // Anschluss in "Vmax-Aufhebung" mit ab (ohne Leerzeichen).
  String.raw`\b((?:inkl\.?|mit)\s+)?${VMAX_CORE_PATTERN.source}[\s-]*(Aufhebung|Anhebung|Aufh\.|Anheb\.)`,
  "gi",
);

const STRINGS: Record<Locale, { stage: (n: string) => string; increase: string; vmaxSuffix: string }> = {
  de: {
    stage: (n) => `Stufe ${n}`,
    increase: "Leistungssteigerung",
    vmaxSuffix: " mit V/max-Aufhebung",
  },
  en: {
    stage: (n) => `Stage ${n}`,
    increase: "Power increase",
    vmaxSuffix: " with V-max removal",
  },
};

/** U+00A0 (geschütztes Leerzeichen, vereinzelt in der Excel) zu normalem Leerzeichen. */
export function normalizeNbsp(text: string): string {
  return text.replace(/\u00A0/g, " ");
}

function cleanDetail(raw: string): string {
  let s = raw;
  s = s.replace(VMAX_LIFT_THEN_MENTION_PATTERN, " ");
  s = s.replace(VMAX_MENTION_THEN_LIFT_PATTERN, " ");
  s = s.replace(/\s+/g, " ").trim();
  // Stray Satzzeichen an den Rändern entfernen, die nach den obigen
  // Entfernungen übrig bleiben (z.B. ein Komma, das vorher zwei Angaben
  // trennte, oder ein Doppelpunkt ohne folgenden Text mehr).
  s = s.replace(/^[\s,;:.\-]+/, "").replace(/[\s,;:.\-]+$/, "");
  // Ist der komplette Rest von genau EINER Klammer umschlossen (der
  // häufigste Fall, z.B. "(M6 & A8-Getriebe)"), die Klammer selbst
  // entfernen - Info steht sonst doppelt umklammert in draft.itemDescription
  // (" ({description})").
  const wrapped = s.match(/^\(([^()]*)\)$/);
  if (wrapped) s = wrapped[1].trim();
  // Jetzt leer gewordene Klammerpaare (z.B. wenn nur die V/max-Phrase darin
  // stand) noch entfernen und erneut zusammenfassen.
  s = s.replace(/\(\s*\)/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

function stageDisplay(
  name: string,
  description: string | null | undefined,
  ps_to: number | null | undefined,
  nm_to: number | null | undefined,
  locale: Locale,
): ProductDisplay {
  const strings = STRINGS[locale] ?? STRINGS.de;
  const stageMatch = STAGE_NUMBER_PATTERN.exec(name);
  let title = stageMatch ? strings.stage(stageMatch[1]) : strings.increase;

  // Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 2): die description
  // wurde bisher komplett verworfen. 8 aktive Stufen tragen die V/max-Angabe
  // AUSSCHLIESSLICH in der description (nicht im Namen, z.B. weil die
  // Excel-Zelle über zwei Spalten umgebrochen ist) - ohne description hier
  // fehlte der Titel-Zusatz komplett (M2 F87 N55, M3 F80) oder zwei sonst
  // identisch benannte Stufen waren nicht mehr unterscheidbar (X1 F48 25d/
  // 25i: eine trägt "Anhebung der serienmässigen V/max Begrenzung" nur in
  // der description). name + description zusammen als EIN Text behandelt -
  // sowohl für die V/max-Erkennung als auch für die restliche
  // Detail-Bereinigung (STAGE_PREFIX/BASIS/PS_NM/V-max-Phrasen) - deckt
  // dabei auch den Fall ab, in dem die V/max-Phrase selbst über
  // Name/description gesplittet ist ("... inkl. Aufhebung der
  // serienmässigen" im Namen, "V/max Begrenzung" in der description).
  const combined = description ? `${normalizeNbsp(name)} ${normalizeNbsp(description)}` : normalizeNbsp(name);

  if (VMAX_MENTION_PATTERN.test(combined) && VMAX_LIFT_PATTERN.test(combined)) {
    title += strings.vmaxSuffix;
  }

  const subtitle =
    ps_to != null && nm_to != null
      ? `${ps_to} PS / ${nm_to} Nm`
      : ps_to != null
        ? `${ps_to} PS`
        : nm_to != null
          ? `${nm_to} Nm`
          : "";

  let rest = combined;
  // Nachzug Prüfung Phase D, Punkt 3: ohne erkennbare Stufennummer fällt der
  // Titel auf strings.increase ("Leistungssteigerung") zurück (siehe oben) -
  // das Wort selbst muss dann auch aus der Detailzeile verschwinden, sonst
  // wiederholt sich der Titel dort (z.B. "Leistungssteigerung mit
  // Vmax-Aufhebung" ohne eigene Stufe/PS-Nm-Angabe). MIT Stufennummer
  // übernimmt STAGE_PREFIX_PATTERN direkt unten das kombinierte
  // "Leistungssteigerung Stufe N"-Präfix, hier also bewusst nur im
  // Fallback-Fall.
  if (!stageMatch) {
    rest = rest.replace(/\bLeistungssteigerung\b/gi, " ");
  }
  rest = rest.replace(STAGE_PREFIX_PATTERN, " ");
  rest = rest.replace(BASIS_PATTERN, " ");
  rest = rest.replace(PS_NM_PATTERN, " ");
  let detail = cleanDetail(rest);

  // Befund 6 (siehe BUILD_DATE_PATTERN oben): eine gefundene Bauzeitangabe
  // wird aus der Detailzeile in den Titel gezogen (nach dem bereits
  // bestehenden Bereinigen der V/max-Phrase, damit z.B. "(bis 6.2020 mit
  // V/max. Aufhebung)" nicht doppelt verarbeitet wird - cleanDetail hat die
  // V/max-Phrase zu diesem Zeitpunkt schon entfernt).
  const dateMatch = BUILD_DATE_PATTERN.exec(detail);
  if (dateMatch) {
    title += ` ${dateMatch[0].replace(/\s+/g, " ").trim()}`;
    detail = `${detail.slice(0, dateMatch.index)} ${detail.slice(dateMatch.index + dateMatch[0].length)}`
      .replace(/\s+/g, " ")
      .trim();
    detail = detail.replace(/^[\s,;:.\-]+/, "").replace(/[\s,;:.\-]+$/, "");
  }

  return { title, subtitle, detail };
}

function plainDisplay(name: string, description: string | null | undefined): ProductDisplay {
  const title = normalizeNbsp(name);
  const lines = (description ?? "")
    .split(/\n+/)
    .map((line) => normalizeNbsp(line).trim())
    .filter(Boolean);
  return { title, subtitle: lines[0] ?? "", detail: lines.slice(1).join("\n") };
}

/**
 * Leitet Titel/Nebenzeile/Detail aus einem Produkt ab. variant_group ===
 * "leistung": Titel "Stufe N" (bzw. "Leistungssteigerung" ohne erkennbare
 * Stufennummer), Nebenzeile "{ps_to} PS / {nm_to} Nm", Detail die
 * Restinformation aus dem Namen (ohne Basis-Klammer, ohne PS/Nm-Angabe, ohne
 * "Stufe N:"). Alle anderen Produkte: Titel der (NBSP-normalisierte) Name,
 * Nebenzeile die erste Beschreibungszeile, Detail die weiteren Zeilen.
 */
export function productDisplay(product: ProductDisplayInput, locale: Locale): ProductDisplay {
  // Befund 1: ein eigenständiges V/max-Produkt "... ohne Leistungssteigerung"
  // bleibt trotz variant_group "leistung" (Exklusivität, siehe
  // variant-groups.ts) ausserhalb der Stufen-Darstellung - Titel ist der
  // (NBSP-normalisierte) Name, wie jedes andere Nicht-Stufen-Produkt.
  if (product.variant_group === "leistung" && !isStandaloneVmaxProduct(product.name)) {
    return stageDisplay(product.name, product.description, product.ps_to, product.nm_to, locale);
  }
  return plainDisplay(product.name, product.description);
}

// ---------------------------------------------------------------------------
// Positionszeilen (Antwortentwurf, Mails, Admin-Ticket): Titel+Nebenzeile+
// Detail zu EINEM Namen/EINER Beschreibung zusammenfassen, in der Form, die
// die bestehenden Textbausteine (draft.itemLine/itemDescription, siehe
// lib/i18n/de.ts+en.ts) bereits erwarten - dadurch reicht ein einzeiliger
// Aufrufer-seitiger Eingriff, ohne lib/mail/render.ts selbst anzufassen
// (dessen itemLineText()/itemList() bleiben unverändert, sie bekommen nur
// bereits fertig aufbereitete name/description-Werte).
// ---------------------------------------------------------------------------

// Korrektur 15.09.2026 (Prüfung Modul Produkte, Befund 2): confirmation.ts,
// summary.ts (Mailvorlagen) und inbox.ts leiteten "ist eine Motor-
// Leistungsstufe" (isStage) bislang über `ps_to != null` her, statt wie
// lib/draft/template.ts (buildItemLine()) über `variant_group ===
// 'leistung'` (plus dieselbe isStandaloneVmaxProduct()-Ausnahme) - siehe
// dortigen Kommentar. 13 aktive Leistungsstufen-Produkte (variant_group
// "leistung") haben aber `ps_to === null` (noch unbepreiste Platzhalter,
// z.B. 5er G60/G61 "(Basis 208 PS)  PS / Nm B48"): dort landete in den drei
// Kundentexten (Kachel/Entwurf via isStage=variantGroup vs. Mails via
// isStage=ps_to!=null) ein inkonsistenter roher Excel-Name inkl. der
// "(Basis ...)"-Klammer statt "Leistungssteigerung (B48)".
//
// Gemeinsame Herleitung für alle Aufrufer, die (wie MailInquiryItem, siehe
// lib/mail/types.ts) sowohl variant_group als auch ps_to kennen KÖNNEN,
// aber variant_group bei älteren, vor dieser Korrektur gespeicherten
// inquiries.selections-Einträgen noch nicht haben (dort bleibt
// item.variant_group aus lib/inquiry/context.ts parseItems() `undefined`,
// nicht `null` - `null` heisst "product.variant_group war in der DB NULL",
// `undefined` heisst "unbekannt, weil nicht gespeichert"). Nur im
// `undefined`-Fall der alte Ersatz (`ps_to != null`); ist variant_group
// bekannt (auch `null`), entscheidet ausschliesslich sie - genau wie
// lib/draft/template.ts buildItemLine().
export interface StageItemInput {
  name: string;
  /** `undefined`, wenn unbekannt (ältere gespeicherte Anfrage ohne dieses Feld) - siehe Kommentar oben. */
  variant_group?: string | null;
  ps_to?: number | null;
}

/** true, wenn `item` als Motor-Leistungsstufe angezeigt werden soll (Titel "Stufe N"/"Leistungssteigerung" statt Excel-Name). */
export function isStageItem(item: StageItemInput): boolean {
  if (item.variant_group !== undefined) {
    return item.variant_group === "leistung" && !isStandaloneVmaxProduct(item.name);
  }
  return item.ps_to != null;
}

export interface ItemDisplayInput {
  name: string;
  description: string | null;
  /** true, wenn die Position eine Motor-Leistungsstufe ist (variant_group
   * "leistung"). Aufrufer, die kein variant_group kennen (z.B. MailInquiryItem,
   * siehe lib/mail/types.ts), leiten das defensiv über `psTo != null` ab -
   * ps_to/nm_to sind laut Datenmodell ausschliesslich bei Leistungsstufen
   * gefüllt (siehe lib/mail/types.ts MailInquiryItem-Kommentar). */
  isStage: boolean;
  psTo: number | null;
  nmTo: number | null;
}

export interface ItemDisplayResult {
  name: string;
  description: string | null;
  /** Der unveränderte Original-Excel-Name, nur gefüllt, wenn er vom
   * angezeigten Namen abweicht (Leistungsstufen) - für die interne
   * Inbox-Mail und den Admin ("dÄHLer kennt seine Bezeichnungen"). */
  originalName: string | null;
}

/** Positionszeile für Kundentexte (Antwortentwurf, Bestätigungs-/Zusammenfassungsmail). */
export function displayItemFields(input: ItemDisplayInput, locale: Locale): ItemDisplayResult {
  const d = productDisplay(
    {
      name: input.name,
      description: input.description,
      variant_group: input.isStage ? "leistung" : null,
      ps_to: input.psTo,
      nm_to: input.nmTo,
    },
    locale,
  );
  if (!input.isStage) {
    return { name: d.title, description: input.description, originalName: null };
  }
  const paren = [d.subtitle, d.detail].filter(Boolean).join(", ");
  const name = paren ? `${d.title} (${paren})` : d.title;
  const normalizedOriginal = normalizeNbsp(input.name);
  return { name, description: null, originalName: normalizedOriginal !== name ? normalizedOriginal : null };
}
