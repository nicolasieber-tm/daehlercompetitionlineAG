// Live-Vorschau der Mailtexte im Admin (Seite «Mailtexte»). Baut mit einem
// festen Beispielkontext dieselben Mails wie der Versand: der
// Antwortentwurf über buildDraftParagraphs() (lib/draft/template.ts), die
// Bestätigungsmail über buildConfirmation() (lib/mail/templates/
// confirmation.ts). Rein und ohne DB-/Node-Importe, damit der Client-Editor
// sie beim Tippen aufrufen kann. Die Beispielwerte sind erfunden und nur
// für die Vorschau, sie landen nirgends in einer echten Anfrage.
import { buildDraftParagraphs } from "@/lib/draft/template";
import type { DraftContext, DraftItem, DraftParagraph } from "@/lib/draft/template";
import { buildConfirmation, confirmationTextParts } from "@/lib/mail/templates/confirmation";
import { mailTextSettingKey, MAIL_TEXT_KEYS } from "@/lib/mail/texts";
import type { MailTexts } from "@/lib/mail/texts";
import type { MailInquiryContext, MailInquiryItem } from "@/lib/mail/types";
import type { Inquiry } from "@/lib/db/rows";
import type { Locale } from "@/lib/i18n/dictionaries";

export const PREVIEW_SCENARIO_IDS = ["single", "multi", "noSalutation"] as const;
export type PreviewScenarioId = (typeof PREVIEW_SCENARIO_IDS)[number];

export interface PreviewSignature {
  name: string;
  company: string;
  /** settings.company_address, wie in der echten Signatur (companyLine() verhindert Dopplungen). */
  address: string;
  phone: string;
}

interface Scenario {
  salutation: "herr" | "frau" | null;
  firstName: string;
  lastName: string;
  vehicle: string;
  year: string;
  character: "dezent" | "sportlich" | "maximum";
  categories: DraftContext["categories"];
  followUpAnswers: Record<string, string>;
  items: DraftItem[];
  timing: "asap" | "m1_2" | "m3_6" | "flexible";
}

const ITEM_BASE = { psTo: null, nmTo: null, variantGroup: null } as const;

const CDC2: DraftItem = {
  ...ITEM_BASE,
  category: "raeder",
  name: "CDC2 FORGED Schmiederadsatz bestehend aus:",
  description: '9 x 20" mit 255/30 20 VA\n10 x 20" mit 275/30 20 HA',
  priceTotal: 7300,
  priceStatus: "priced",
};

const STUFE_1: DraftItem = {
  category: "motor",
  name: "Stufe 1: (Basis 480 PS) 620PS / 740Nm (M6 & A8-Getriebe)",
  description: null,
  priceTotal: 4180,
  priceStatus: "priced",
  psTo: 620,
  nmTo: 740,
  variantGroup: "leistung",
};

const KOMPLETTANLAGE: DraftItem = {
  ...ITEM_BASE,
  category: "auspuff",
  name: "Edelstahl Komplettanlage HP mit Bi-Klappensteuerung ohne Endrohre",
  description: null,
  priceTotal: 5260,
  priceStatus: "priced",
  variantGroup: "anlage",
};

const SCENARIOS: Record<PreviewScenarioId, Scenario> = {
  single: {
    salutation: "herr",
    firstName: "Max",
    lastName: "Muster",
    vehicle: "BMW M2 (G87)",
    year: "2025",
    character: "sportlich",
    categories: ["raeder"],
    followUpAnswers: { raeder: "schwarz" },
    items: [CDC2],
    timing: "m1_2",
  },
  multi: {
    salutation: "frau",
    firstName: "Anna",
    lastName: "Beispiel",
    vehicle: "BMW M2 (G87)",
    year: "2025",
    character: "sportlich",
    categories: ["motor", "auspuff"],
    followUpAnswers: { motor: "beides", auspuff: "kraeftig" },
    items: [STUFE_1, KOMPLETTANLAGE],
    timing: "m1_2",
  },
  noSalutation: {
    salutation: null,
    firstName: "Max",
    lastName: "Muster",
    vehicle: "BMW M2 (G87)",
    year: "2025",
    character: "dezent",
    categories: ["auspuff"],
    followUpAnswers: { auspuff: "dezent" },
    items: [KOMPLETTANLAGE],
    timing: "flexible",
  },
};

/** Die Texte als settings-Map, wie sie resolveMailTexts() aus der DB liest (leer = Standardtext). */
function settingsFor(texts: MailTexts, locale: Locale): Record<string, string> {
  return Object.fromEntries(MAIL_TEXT_KEYS.map((key) => [mailTextSettingKey(key, locale), texts[key]]));
}

const NUMBER = "2026-0912";

export function previewDraft(
  scenarioId: PreviewScenarioId,
  locale: Locale,
  texts: MailTexts,
  signature: PreviewSignature,
): { subject: string; paragraphs: DraftParagraph[] } {
  const s = SCENARIOS[scenarioId];
  const total = s.items.reduce((sum, item) => sum + (item.priceTotal ?? 0), 0);
  return buildDraftParagraphs(
    {
      number: NUMBER,
      salutation: s.salutation,
      firstName: s.firstName,
      lastName: s.lastName,
      vehicleLabel: s.vehicle,
      year: s.year,
      character: s.character,
      categories: s.categories,
      followUpAnswers: s.followUpAnswers,
      consulting: false,
      timing: s.timing,
      hasPricelist: true,
      items: s.items,
      estimatedTotal: total,
      settings: {
        signatureName: signature.name,
        companyAddress: signature.address,
        companyName: signature.company,
        signaturePhone: signature.phone,
        texts: settingsFor(texts, locale),
      },
    },
    locale,
  );
}

function baseInquiry(s: Scenario, locale: Locale, total: number): Inquiry {
  return {
    ai_extraction: null,
    answer_received_at: null,
    been_here: false,
    categories: s.categories,
    channel: "email",
    character: s.character,
    checks: [],
    city: null,
    consulting: false,
    created_at: "2026-10-28T09:00:00.000Z",
    draft_reply: null,
    draft_subject: null,
    email: "kunde@example.com",
    estimated_total: total,
    family_id: null,
    salutation: s.salutation,
    first_name: s.firstName,
    follow_up_answers: s.followUpAnswers,
    gearbox: null,
    line: null,
    body_style: null,
    drive: null,
    translations: null,
    id: "00000000-0000-0000-0000-000000000000",
    last_name: s.lastName,
    locale,
    message: null,
    model_id: null,
    number: NUMBER,
    phone: null,
    raw_text: null,
    replied_at: null,
    selections: [],
    series_ps: null,
    share_token: "vorschau",
    source: "web",
    status: "neu",
    timing: s.timing,
    updated_at: "2026-10-28T09:00:00.000Z",
    vehicle_text: s.vehicle,
    year: s.year,
  };
}

/**
 * Bestätigungsmail als Klartext-Absätze. Absätze, die aus den Mailtexten
 * stammen (Einleitung, Charaktersatz mit Überleitung, Schluss), sind
 * `generated: false`, alles andere (Übersicht, Positionen, Richtsumme, Link,
 * nächste Schritte) baut das Tool.
 */
export function previewConfirmation(
  scenarioId: PreviewScenarioId,
  locale: Locale,
  texts: MailTexts,
): { subject: string; paragraphs: DraftParagraph[] } {
  const s = SCENARIOS[scenarioId];
  const total = s.items.reduce((sum, item) => sum + (item.priceTotal ?? 0), 0);
  const items: MailInquiryItem[] = s.items.map((item) => ({
    category: item.category,
    name: item.name,
    description: item.description,
    price_total: item.priceTotal,
    price_status: item.priceStatus,
    ps_to: item.psTo,
    nm_to: item.nmTo,
    variant_group: item.variantGroup,
  }));
  const ctx: MailInquiryContext = {
    inquiry: baseInquiry(s, locale, total),
    family: null,
    model: null,
    items,
    estimatedTotal: total,
    checks: [],
    draft: { subject: "", body: "" },
    locale,
    translations: null,
    appUrl: "https://anfrage.daehler.com",
    shareUrl: "https://anfrage.daehler.com/p/vorschau",
    adminUrl: "https://anfrage.daehler.com/admin",
    texts: settingsFor(texts, locale),
  };
  const { subject, text } = buildConfirmation(ctx);
  const parts = confirmationTextParts(ctx);
  const own = new Set(
    [parts.intro, parts.lead, parts.closing].flatMap((block) => block.split(/\n{2,}/).map((p) => p.trim())),
  );
  // Kopf (Firmenname, Betreff) und Fusszeile der Klartext-Mail weglassen, die Vorschau zeigt den Betreff separat.
  const all = text.split(/\n{2,}/).map((p) => p.trim());
  const start = all.indexOf(subject) + 1;
  const end = all.findIndex((p) => p.startsWith("--"));
  const body = all.slice(start > 0 ? start : 0, end > start ? end : undefined).filter(Boolean);
  return { subject, paragraphs: body.map((p) => ({ text: p, generated: !own.has(p) })) };
}
