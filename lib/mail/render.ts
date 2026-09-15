// Layout und Bausteine für HTML-Mails im dÄHLer-Brand-Look: dunkler Kopf
// mit der Wortmarke "dÄHLer" als Text (kein Logo-Bild, damit es in jedem
// Mailclient ohne Bilder-Blocker lesbar bleibt), Rot #E21014 als Akzent,
// heller Inhalt für Lesbarkeit in allen Clients. Tabellen-Layout, Inline-CSS,
// max. 600px, mobil lesbar. Siehe CLAUDE.md (Brand: Rot #E21014, Dunkelgrau
// #181D1E, Weiss) und docs/architektur.md, Abschnitt "Mail".
//
// Jeder Baustein liefert sowohl die HTML- als auch die Text-Variante
// (MailBlock), damit renderMail() beide Fassungen aus derselben Bausteinliste
// zusammensetzen kann und sie nie auseinanderlaufen.
import { getDictionary, tf } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/dictionaries";
import { chf, chfFrom } from "@/lib/i18n/format";
import { vehicleDisplayLabel } from "@/lib/catalog/vehicle-label";
import { buildPowerBeforeAfter, formatPowerLine } from "@/lib/catalog/power-before-after";
import type { Model, ModelFamily } from "@/lib/supabase/rows";
import type { MailInquiryItem } from "./types";

const BRAND_RED = "#e21014";
const BRAND_DARK = "#181d1e";
const TEXT = "#1c2122";
const MUTED = "#626b6d";
const DIM = "#8a9092";
const BORDER = "#e6e6e6";
const PANEL = "#f7f7f7";
const FONT = "Arial, Helvetica, sans-serif";
const MONO = "'Courier New', Courier, monospace";

export interface MailBlock {
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2br(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

// --- Kategorie- und Fahrzeug-Hilfen -----------------------------------------

/** Löst eine FlowCategory über das Dictionary auf ("motor" -> "Motor" / "Engine"). */
export function categoryLabel(category: string, locale: Locale): string {
  const dict = getDictionary(locale);
  const categories = dict.steps.wish.categories as Record<string, { title: string }>;
  return categories[category]?.title ?? category;
}

/** Löst eine ID aus einer {id,label}-Optionsliste des Dictionaries auf (Termin, Kanal, Charakter, Folgefragen). */
export function optionLabel(
  options: readonly { id: string; label: string }[] | undefined,
  id: string | null | undefined,
): string | null {
  if (!id || !options) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}

/**
 * Erkennt die drei Kurzablauf-Platzhalterfamilien aus supabase/seed.sql
 * («Älteres Modell», «Älteres MINI-Modell», «Anderes Toyota-Modell», siehe
 * docs/architektur.md "has_pricelist bool (false für Wiesmann und «Älteres
 * Modell»-Platzhalter)"). Es gibt dafür kein eigenes DB-Flag (has_pricelist
 * ist auch bei Wiesmann false, dessen Familiennamen aber echte Modellnamen
 * sind, kein Platzhalter) - deshalb Namensmuster statt has_pricelist.
 *
 * Wird von vehicleLabel()/vehicleDisplayLabel() nicht (mehr) verwendet: die
 * Formel unterscheidet seit Prüfung Punkt 3 nicht mehr zwischen "echter"
 * Platzhalterfamilie und einer Familie ohne Modell-Katalog wie Wiesmann
 * (siehe lib/catalog/vehicle-label.ts) - bleibt aber exportiert, falls
 * andere Stellen (z.B. Admin-Filter) gezielt nach diesen drei Namen
 * unterscheiden wollen.
 */
export function isPlaceholderFamilyName(name: string): boolean {
  return /^(Älteres|Anderes)\b.*\bModell$/.test(name.trim());
}

/**
 * Kundensichtbare Fahrzeugbezeichnung aus Familie/Modell, oder
 * inquiries.vehicle_text als Fallback. Reiner Re-Export von
 * vehicleDisplayLabel() (lib/catalog/vehicle-label.ts) gegen die vollen
 * ModelFamily/Model-Row-Typen - die eigentliche Formel (samt Beispielen und
 * Begründung) steht jetzt nur noch dort, damit lib/inquiry/share.ts und
 * components/flow/vehicleLabel.ts dieselbe Funktion aufrufen statt eigene,
 * auseinanderlaufende Kopien zu pflegen (Prüfung, Befund 3).
 *
 * Verhaltensänderung gegenüber der vorigen Fassung dieser Funktion: ohne
 * gewähltes Modell wird inquiries.vehicle_text jetzt auch bei BEKANNTER
 * Familie als Modell-Ersatz angehängt ("Wiesmann, MF4", "BMW Älteres
 * Modell, E46 M3") statt nur, wenn gar keine Familie bekannt ist - Familien
 * ohne Modell-Katalog (has_pricelist false: die drei Kurzablauf-
 * Platzhalternamen sowie Wiesmann) haben sonst keine Möglichkeit, die vom
 * Kunden/Sprachmodell erfasste konkrete Modellbezeichnung überhaupt zu
 * zeigen. Der Familienname fällt dabei nach wie vor NIE weg.
 */
export function vehicleLabel(params: {
  family: ModelFamily | null;
  model: Model | null;
  vehicleText: string | null;
}): string {
  return vehicleDisplayLabel(params);
}

/**
 * Firmenzeile für die Signatur (Antwortentwurf lib/draft/template.ts,
 * Follow-up-Mail lib/mail/templates/follow_up.ts): Firmenname
 * (settings.mail_from_name) plus Adresse (settings.company_address), Komma-
 * getrennt, Adresse nur wenn gesetzt.
 *
 * Befund «polish» #1 (Prüfung Phase B, Punkt 6 nachgebessert): der
 * ausgelieferte Seed-Wert für company_address ist selbst bereits
 * "dÄHLer Competition Line AG, Belp" (voller Firmenname inklusive), nicht
 * nur die reine Adresse "Belp" - mail_from_name unbedingt davorzusetzen
 * ergab dort "dÄHLer Competition Line AG, dÄHLer Competition Line AG,
 * Belp" (jede Follow-up-Mail betroffen, solange niemand company_address in
 * den Einstellungen von Hand kürzt). Statt company_address selbst
 * umzustellen (Migration/Seed/Admin-Hilfetext liegen ausserhalb der für
 * diese Korrektur zugewiesenen Dateien) hängt companyLine() den Namen nur
 * an, wenn die Adresse ihn nicht bereits selbst als Anfang enthält -
 * funktioniert unverändert für eine künftig auf die reine Adresse
 * gekürzte company_address ("Belp" -> "dÄHLer Competition Line AG, Belp"),
 * verdoppelt den Namen aber nicht mehr, wenn er schon Teil der Adresse ist.
 */
export function companyLine(name: string, address: string): string {
  if (!address) return name;
  if (!name) return address;
  return address.toLowerCase().startsWith(name.toLowerCase()) ? address : `${name}, ${address}`;
}

// --- Positionszeile (wiederverwendet die draft.*-Textbausteine, siehe
// docs/architektur.md "• Motor: Stufe 1 (620 PS / 740 Nm), ab CHF 4'180") ---

/**
 * products.description enthält bei allen Radsätzen echte Zeilenumbrüche aus
 * der Excel-Zelle (z.B. "10 x 20\" mit 275/30 20\n10 x 20\" mit 285/30 20"
 * für Vorder-/Hinterachse, siehe docs/excel-import.md). Roh in die
 * Positionszeile eingesetzt landete der Zeilenumbruch mitten in der
 * Klammer ("bestehend aus: (10 x 20\" ...\n10 x 20\" ...), ab CHF ...") -
 * Befund #2 der Anfrage-Prüfung. Für Kundentext (Antwortentwurf, Mails)
 * stattdessen zu einer Zeile zusammenfassen.
 */
/** Die Rohteile einer Positionszeile, ohne Zusammensetzung zu einer einzelnen Zeile. */
interface ItemLineParts {
  category: string;
  /** Name ohne trailing ":" (siehe itemLineText-Kommentar), unverändert. */
  name: string;
  /** Beschreibung in einzelne, getrimmte Zeilen zerlegt (leer, wenn keine Beschreibung). */
  descriptionLines: string[];
  /** Fertig formatierter Preis-Suffix (", ab CHF 4'180" / ", in Vorbereitung" / ", auf Anfrage" / ""). */
  price: string;
}

function itemLineParts(item: MailInquiryItem, locale: Locale): ItemLineParts {
  const dict = getDictionary(locale);
  const category = categoryLabel(item.category, locale);
  // Produktnamen wie "CDC1 FORGED Radsatz geschmiedet bestehend aus:" enden
  // in der Excel-Preisliste mit einem Doppelpunkt, der auf die anschliessend
  // umklammerte Beschreibung verweisen sollte ("... aus: (10 x 20\" ...)"),
  // vor der Klammer aber wie ein zweites Satzzeichen wirkt. Nur am
  // Namensende, nicht mitten im Namen (z.B. "Stufe 1: (Basis 480 PS) ...").
  const name = item.name.replace(/:\s*$/, "");
  const descriptionLines = item.description
    ? item.description
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  let price = "";
  if (item.price_status === "priced" && item.price_total != null) {
    price = tf(dict.draft.itemPrice, { price: chf(item.price_total) });
  } else if (item.price_status === "in_preparation") {
    price = dict.draft.itemPriceInPreparation;
  } else if (item.price_status === "on_request") {
    price = dict.draft.itemPriceOnRequest;
  }
  return { category, name, descriptionLines, price };
}

/**
 * Eine Positionszeile als reiner Text, exakt wie im Antwortentwurf
 * (lib/draft/template.ts): mehrzeilige Beschreibungen (Radsätze) werden zu
 * EINER Zeile mit Komma-Trennung zusammengefasst - der Antwortentwurf ist
 * reiner Fliesstext ohne die Einrückung, die itemList() (unten) für die
 * Mailvorlagen verwendet.
 */
export function itemLineText(item: MailInquiryItem, locale: Locale): string {
  const dict = getDictionary(locale);
  const { category, name, descriptionLines, price } = itemLineParts(item, locale);
  const description =
    descriptionLines.length > 0
      ? tf(dict.draft.itemDescription, { description: descriptionLines.join(", ") })
      : "";
  return tf(dict.draft.itemLine, { category, name, description, price });
}

/**
 * Klartext-Zeile "460 PS → 620 PS / 740 Nm (+160 PS)" für die Bestätigungs-/
 * Zusammenfassungsmail (Rückmeldung zweiter Klicktest, CLAUDE.md Abschnitt
 * "AUFGABE", Punkt 3, siehe lib/catalog/power-before-after.ts und
 * components/flow/beforeAfter.ts, dieselbe Herleitung für Abschluss-Screen/
 * Teilen-Seite). null, wenn keine Leistungsstufe gewählt wurde oder die
 * Serienleistung nicht bekannt ist - dann bleibt die Zeile ganz weg, wie
 * beim Text-Fallback der Vorher/Nachher-Tabelle ohne gewählte Stufe.
 */
export function motorPowerLine(params: {
  seriesPs: number | null;
  seriesNm: number | null;
  items: MailInquiryItem[];
}): string | null {
  const stage = params.items.find(
    (i) => i.category === "motor" && i.variant_group === "leistung" && i.ps_to != null,
  );
  const power = buildPowerBeforeAfter(params.seriesPs, params.seriesNm, stage?.ps_to, stage?.nm_to);
  return power ? formatPowerLine(power) : null;
}

// --- Bausteine ---------------------------------------------------------------

export function paragraph(text: string): MailBlock {
  if (!text) return { html: "", text: "" };
  return {
    html: `<p style="margin:0 0 16px;">${nl2br(text)}</p>`,
    text,
  };
}

/** Mehrere durch Leerzeile getrennte Absätze (z.B. der Antwortentwurf) als eine Baustein-Liste. */
export function paragraphs(text: string): MailBlock[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(paragraph);
}

export interface DefinitionRow {
  label: string;
  value: string;
}

/** Label/Wert-Zeilen, z.B. für die interne Ticket-Ansicht (inbox). */
export function definitionList(rows: DefinitionRow[]): MailBlock {
  const visible = rows.filter((r) => r.value);
  if (visible.length === 0) return { html: "", text: "" };
  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:14px;">` +
    visible
      .map(
        (r) =>
          `<tr><td style="padding:3px 12px 3px 0;color:${MUTED};white-space:nowrap;vertical-align:top;font-weight:bold;">${escapeHtml(r.label)}</td><td style="padding:3px 0;color:${TEXT};vertical-align:top;">${nl2br(r.value)}</td></tr>`,
      )
      .join("") +
    `</table>`;
  const text = visible.map((r) => `${r.label}: ${r.value}`).join("\n");
  return { html, text };
}

/**
 * Positionsliste für die Mailvorlagen (inbox, confirmation, summary; nicht
 * für den Antwortentwurf, der itemLineText() direkt verwendet). Leer ->
 * Fallback-Absatz. Prüfung Phase B, Punkt 2: eine EINZEILIGE Beschreibung
 * bleibt wie bisher in Klammern auf derselben Zeile ("Name (Beschreibung),
 * Preis"); eine MEHRZEILIGE Beschreibung (Radsätze mit getrennter Vorder-/
 * Hinterachsen-Zeile, siehe docs/excel-import.md) wird stattdessen unter der
 * Name/Preis-Zeile dargestellt - in der HTML-Fassung mit <br> zwischen den
 * Zeilen, in der Text-Fassung eingerückt -, statt (wie itemLineText() für
 * den Antwortentwurf) zu einer Komma-Zeile zusammengefasst zu werden.
 */
export function itemList(items: MailInquiryItem[], locale: Locale): MailBlock {
  const dict = getDictionary(locale);
  if (items.length === 0) {
    return paragraph(dict.draft.itemsFallback);
  }
  const rows = items.map((item) => itemLineParts(item, locale));
  const html =
    `<ul style="margin:0 0 16px;padding:0;list-style:none;">` +
    rows
      .map((r) => {
        const head = `${escapeHtml(r.category)}: ${escapeHtml(r.name)}`;
        const price = escapeHtml(r.price);
        if (r.descriptionLines.length === 0) {
          return `<li style="margin:0 0 8px;padding:8px 0;border-bottom:1px solid ${BORDER};">${head}${price}</li>`;
        }
        if (r.descriptionLines.length === 1) {
          return `<li style="margin:0 0 8px;padding:8px 0;border-bottom:1px solid ${BORDER};">${head} (${escapeHtml(
            r.descriptionLines[0],
          )})${price}</li>`;
        }
        const description = r.descriptionLines.map((line) => escapeHtml(line)).join("<br>");
        return `<li style="margin:0 0 8px;padding:8px 0;border-bottom:1px solid ${BORDER};">${head}${price}<br>${description}</li>`;
      })
      .join("") +
    `</ul>`;
  const text = rows
    .map((r) => {
      const head = `• ${r.category}: ${r.name}`;
      if (r.descriptionLines.length === 0) return `${head}${r.price}`;
      if (r.descriptionLines.length === 1) return `${head} (${r.descriptionLines[0]})${r.price}`;
      const indented = r.descriptionLines.map((line) => `    ${line}`).join("\n");
      return `${head}${r.price}\n${indented}`;
    })
    .join("\n");
  return { html, text };
}

/** Vorher/Nachher-Tabelle wie im Kundenflow (docs/vorschau.html, beforeAfter()). */
export interface BeforeAfterRow {
  label: string;
  before: string;
  after: string;
}

export function beforeAfterTable(rows: BeforeAfterRow[], locale: Locale): MailBlock {
  if (rows.length === 0) return { html: "", text: "" };
  const dict = getDictionary(locale);
  const ba = dict.steps.done.beforeAfter;
  const head = `<tr><td style="padding:6px 8px 8px;"></td><td style="padding:6px 8px 8px;color:${MUTED};font-size:12px;text-transform:uppercase;">${escapeHtml(
    ba.before,
  )}</td><td style="padding:6px 8px 8px;color:${TEXT};font-size:12px;text-transform:uppercase;font-weight:bold;">${escapeHtml(
    ba.after,
  )}</td></tr>`;
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:6px 8px;border-top:1px solid ${BORDER};color:${MUTED};font-size:13px;white-space:nowrap;">${escapeHtml(
          r.label,
        )}</td><td style="padding:6px 8px;border-top:1px solid ${BORDER};font-size:13px;color:${MUTED};">${escapeHtml(
          r.before,
        )}</td><td style="padding:6px 8px;border-top:1px solid ${BORDER};font-size:13px;color:${TEXT};font-weight:bold;">${escapeHtml(
          r.after,
        )}</td></tr>`,
    )
    .join("");
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse;">${head}${body}</table>`;
  const text = [
    `${ba.header}:`,
    ...rows.map((r) => `${r.label}: ${r.before} -> ${r.after}`),
  ].join("\n");
  return { html, text };
}

/** Richtpreis-Box: Summe der gewählten Positionen, unverbindlich. */
export function estimateBox(params: {
  estimatedTotal: number | null;
  hasOnRequest: boolean;
  locale: Locale;
}): MailBlock {
  const dict = getDictionary(params.locale);
  const pkg = dict.steps.done.package;
  const label = params.hasOnRequest ? pkg.totalWithOnRequest : pkg.total;
  const value = params.estimatedTotal != null ? chfFrom(params.estimatedTotal, params.locale) : pkg.onRequest;
  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:${PANEL};border-left:4px solid ${BRAND_RED};">` +
    `<tr><td style="padding:14px 16px;">` +
    `<div style="font-family:${FONT};font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(
      label,
    )}</div>` +
    `<div style="font-family:${MONO};font-size:20px;font-weight:bold;color:${BRAND_DARK};">${escapeHtml(
      value,
    )}</div>` +
    `</td></tr></table>`;
  const text = `${label}: ${value}`;
  return { html, text };
}

/** Prüfhinweise als Liste (nur intern, inbox). */
export function checklist(items: string[]): MailBlock {
  if (items.length === 0) return { html: "", text: "" };
  const html =
    `<ul style="margin:0 0 16px;padding-left:18px;color:${TEXT};">` +
    items.map((i) => `<li style="margin:0 0 6px;">${escapeHtml(i)}</li>`).join("") +
    `</ul>`;
  const text = items.map((i) => `▸ ${i}`).join("\n");
  return { html, text };
}

/** Blockzitat, z.B. Kundennachricht oder Antwortentwurf-Vorschau in der internen Mail. */
export function quote(text: string): MailBlock {
  if (!text) return { html: "", text: "" };
  const html = `<blockquote style="margin:0 0 16px;padding:12px 16px;border-left:3px solid ${BORDER};background:${PANEL};color:${TEXT};">${nl2br(
    text,
  )}</blockquote>`;
  const quoted = text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return { html, text: quoted };
}

/** Button-Link, bulletproof genug für die gängigen Mailclients (einfache Tabellenzelle statt Bild). */
export function buttonLink(label: string, url: string): MailBlock {
  if (!label || !url) return { html: "", text: "" };
  const html =
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">` +
    `<tr><td style="border-radius:4px;background:${BRAND_RED};">` +
    `<a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;">${escapeHtml(
      label,
    )}</a>` +
    `</td></tr></table>`;
  const text = `${label}: ${url}`;
  return { html, text };
}

/** Kleingedrucktes am Ende einer Mail (z.B. Unverbindlichkeitshinweis). */
export function fineprint(text: string): MailBlock {
  if (!text) return { html: "", text: "" };
  return {
    html: `<p style="margin:20px 0 0;font-size:12px;color:${DIM};">${nl2br(text)}</p>`,
    text,
  };
}

// --- Layout --------------------------------------------------------------

const WORDMARK_HTML = `<span style="color:${BRAND_RED};">d</span>ÄHLer`;

function layoutHtml(params: { title?: string; bodyHtml: string }): string {
  const heading = params.title
    ? `<h1 style="margin:0 0 18px;font-family:${FONT};font-size:19px;line-height:1.3;color:${BRAND_DARK};">${escapeHtml(
        params.title,
      )}</h1>`
    : "";
  return (
    `<div style="background:${PANEL};padding:24px 0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};">` +
    `<tr><td align="center" style="padding:0 16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;">` +
    `<tr><td style="background:${BRAND_DARK};padding:26px 28px;">` +
    `<div style="font-family:${FONT};font-size:22px;font-weight:bold;letter-spacing:.5px;color:#ffffff;">${WORDMARK_HTML}</div>` +
    `<div style="font-family:${FONT};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#9aa3a5;margin-top:2px;">Competition Line &middot; Belp</div>` +
    `</td></tr>` +
    `<tr><td style="padding:28px;font-family:${FONT};color:${TEXT};font-size:15px;line-height:1.55;">` +
    heading +
    params.bodyHtml +
    `</td></tr>` +
    `<tr><td style="padding:18px 28px;border-top:1px solid ${BORDER};font-family:${FONT};font-size:12px;color:${DIM};">` +
    `dÄHLer Competition Line AG &middot; Belp` +
    `</td></tr>` +
    `</table></td></tr></table></div>`
  );
}

function layoutText(params: { title?: string; bodyText: string }): string {
  const lines = ["dÄHLer Competition Line AG", ""];
  if (params.title) lines.push(params.title, "");
  lines.push(params.bodyText, "", "--", "dÄHLer Competition Line AG · Belp");
  return lines.join("\n");
}

/** Setzt eine Bausteinliste (siehe oben) zu einer vollständigen HTML- und Text-Mail zusammen. */
export function renderMail(params: { title?: string; blocks: MailBlock[] }): { html: string; text: string } {
  const bodyHtml = params.blocks.map((b) => b.html).filter(Boolean).join("\n");
  const bodyText = params.blocks
    .map((b) => b.text)
    .filter(Boolean)
    .join("\n\n");
  return {
    html: layoutHtml({ title: params.title, bodyHtml }),
    text: layoutText({ title: params.title, bodyText }),
  };
}
