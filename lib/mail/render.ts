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

/** "BMW M3 Touring" aus Familie/Modell, oder inquiries.vehicle_text als Fallback (Fahrzeug ohne Modellzuordnung). */
export function vehicleLabel(params: {
  family: ModelFamily | null;
  model: Model | null;
  vehicleText: string | null;
}): string {
  if (params.family) {
    return [params.family.brand, params.family.name, params.model?.name].filter(Boolean).join(" ");
  }
  return params.vehicleText?.trim() || "";
}

// --- Positionszeile (wiederverwendet die draft.*-Textbausteine, siehe
// docs/architektur.md "• Motor: Stufe 1 (620 PS / 740 Nm), ab CHF 4'180") ---

/** Eine Positionszeile als reiner Text, exakt wie im Antwortentwurf (lib/draft/template.ts). */
export function itemLineText(item: MailInquiryItem, locale: Locale): string {
  const dict = getDictionary(locale);
  const category = categoryLabel(item.category, locale);
  const description = item.description
    ? tf(dict.draft.itemDescription, { description: item.description })
    : "";
  let price = "";
  if (item.price_status === "priced" && item.price_total != null) {
    price = tf(dict.draft.itemPrice, { price: chf(item.price_total) });
  } else if (item.price_status === "in_preparation") {
    price = dict.draft.itemPriceInPreparation;
  } else if (item.price_status === "on_request") {
    price = dict.draft.itemPriceOnRequest;
  }
  return tf(dict.draft.itemLine, { category, name: item.name, description, price });
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

/** Positionsliste: Kategorie, Name, Beschreibung, Preis oder Status. Leer -> Fallback-Absatz. */
export function itemList(items: MailInquiryItem[], locale: Locale): MailBlock {
  const dict = getDictionary(locale);
  if (items.length === 0) {
    return paragraph(dict.draft.itemsFallback);
  }
  const lines = items.map((item) => itemLineText(item, locale));
  const html =
    `<ul style="margin:0 0 16px;padding:0;list-style:none;">` +
    lines
      .map(
        (line) =>
          `<li style="margin:0 0 8px;padding:8px 0;border-bottom:1px solid ${BORDER};">${escapeHtml(
            line.replace(/^•\s*/, ""),
          )}</li>`,
      )
      .join("") +
    `</ul>`;
  const text = lines.join("\n");
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
