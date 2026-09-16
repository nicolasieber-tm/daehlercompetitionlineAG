// Gemeinsame Vorher/Nachher-Zeilenlogik, wie beforeAfter() in
// docs/vorschau.html. Reine Datenfunktion (keine Hooks, kein "use client",
// kein DB-/Netzwerkzugriff) - Basis sowohl für den Kundenflow
// (components/flow/beforeAfter.ts, mappt FlowState/SharedInquiryView auf
// dieses Input-Format) als auch für die Kundenmails (lib/mail/render.ts
// beforeAfterTable(), verwendet von lib/mail/templates/{confirmation,
// summary,inbox}.ts, die MailInquiryContext auf dieses Input-Format
// mappen). Vorher nur components/flow/beforeAfter.ts (Abschluss-Screen,
// Teilen-Seite) - Kundenwunsch (CLAUDE.md Abschnitt "AUFGABE"): dieselbe
// Vorher/Nachher-Übersicht soll auch in den Mails erscheinen, ohne die
// Herleitung ein zweites Mal zu pflegen.
//
// Feldnamen der Positionen (category/name/description/variant_group/
// ps_to/nm_to/price_status) bewusst wie lib/mail/types.ts MailInquiryItem
// (snake_case, DB-nah): ein MailInquiryItem[] lässt sich so ohne Um-Mapping
// direkt als `items` übergeben (price_status wird hier nicht ausgewertet -
// die Vorher/Nachher-Zeile zeigt keine Preise -, bleibt aber Teil des Typs,
// damit kein separates, engeres Item-Interface für Mail-Aufrufer nötig ist).
import { getDictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/dictionaries";
import { isStageItem, normalizeNbsp, productDisplay } from "@/lib/catalog/product-display";
import { buildPowerBeforeAfter } from "@/lib/catalog/power-before-after";
import type { PowerBeforeAfter } from "@/lib/catalog/power-before-after";

export interface BeforeAfterItemInput {
  category: string;
  name: string;
  description?: string | null;
  variant_group?: string | null;
  ps_to?: number | null;
  nm_to?: number | null;
  /** Hier ungenutzt (siehe Dateikommentar) - nur Teil des Typs für strukturelle Kompatibilität zu MailInquiryItem. */
  price_status?: string;
}

export interface BeforeAfterInput {
  categories: string[];
  consulting: boolean;
  items: BeforeAfterItemInput[];
  /**
   * Antworten auf die Folgefragen je Kategorie (state.followUpAnswers,
   * components/flow/state.ts, bzw. inquiries.follow_up_answers). Optional
   * und aktuell OHNE Einfluss auf die Zeilen: die bisherige
   * components/flow/beforeAfter.ts (deren Semantik diese Funktion 1:1
   * fortführt, siehe Dateikommentar) nimmt die Folgefrage-Antworten
   * bewusst NICHT in die knapp gehaltene Vorher/Nachher-Zeile auf (anders
   * als das rein-prototypische beforeAfter() in docs/vorschau.html) - die
   * Antworten stehen für Mails bereits über die "ZIEL"-Zeile
   * (lib/inquiry/summary.ts goalText()) zur Verfügung. Nur Teil der
   * Signatur, damit Flow und Mail-Kontext ihn ohne Sonderfall durchreichen
   * können, falls eine künftige Aufgabe ihn doch einbeziehen soll.
   */
  followUpAnswers?: Partial<Record<string, string | null>>;
  character: string | null;
  seriesPs?: number | null;
  seriesNm?: number | null;
  locale: Locale;
}

export interface BeforeAfterRow {
  id: string;
  label: string;
  before: string;
  after: string;
  /**
   * Nur bei id "leistung" UND gewählter Leistungsstufe mit bekannter
   * Serienleistung gefüllt: strukturierte Vorher/Nachher-Zahlen für die
   * grosse Zahlen-Darstellung (components/ui/BeforeAfter.tsx im Flow,
   * beforeAfterTable() in lib/mail/render.ts für die Mails). before/after
   * oben bleiben daneben unverändert die Text-Fallbacks.
   */
  power?: PowerBeforeAfter;
  /**
   * Nur bei id "leistung" gefüllt: Namen weiterer gewählter Motor-Optionen
   * neben der Hauptstufe (z.B. "Sportluftfilter Satz"), mit ", " verbunden -
   * wie in `after` oben und dort bereits enthalten. Getrennt geliefert,
   * damit eine Anzeige sie auch dann noch zeigen kann, wenn `power` gesetzt
   * ist und `after` (der Text-Fallback) durch die grosse Zahlen-Darstellung
   * ersetzt wird (siehe components/flow/steps/DoneStep.tsx, Befund Prüfer,
   * Beleg Anfrage 2026-0293).
   */
  extras?: string;
}

function itemsOf(items: BeforeAfterItemInput[], category: string): BeforeAfterItemInput[] {
  return items.filter((i) => i.category === category);
}

// Derselbe kurze, unterscheidbare Titel wie in der Kachel und in den Mails
// (siehe components/flow/beforeAfter.ts displayName(), dieselbe Herleitung).
function displayName(item: BeforeAfterItemInput, locale: Locale): string {
  if (!isStageItem({ name: item.name, variant_group: item.variant_group, ps_to: item.ps_to })) {
    return normalizeNbsp(item.name);
  }
  return productDisplay(
    { name: item.name, description: item.description, variant_group: item.variant_group, ps_to: item.ps_to, nm_to: item.nm_to },
    locale,
  ).title;
}

function joinNames(items: BeforeAfterItemInput[], adviceValue: string, locale: Locale): string {
  return items.length > 0 ? items.map((i) => displayName(i, locale)).join(", ") : adviceValue;
}

/**
 * Baut die Vorher/Nachher-Zeilen aus dem gewählten Paket, siehe
 * beforeAfter() in docs/vorschau.html. Dieselbe Semantik wie die bisherige
 * components/flow/beforeAfter.ts buildBeforeAfterRows() (die jetzt intern
 * hierher delegiert, siehe dort) - nur die Feldnamen der Eingabe sind
 * DB-nah (snake_case) statt camelCase, siehe Dateikommentar.
 */
export function buildBeforeAfterRows(input: BeforeAfterInput): BeforeAfterRow[] {
  const locale = input.locale;
  const t = getDictionary(locale);
  const rows: BeforeAfterRow[] = [];
  const b = t.steps.done.beforeAfter;
  const advice = b.adviceValue;

  if (input.categories.includes("motor")) {
    const motorItems = itemsOf(input.items, "motor");
    const stage = motorItems.find((i) => i.variant_group === "leistung" && i.ps_to != null);
    const extras = motorItems.filter((i) => i !== stage);
    const before =
      input.seriesPs != null && input.seriesNm != null
        ? `${input.seriesPs} PS · ${input.seriesNm} Nm`
        : b.seriesValue;
    let after: string;
    const extraNames = extras.map((i) => displayName(i, locale)).join(", ");
    if (stage) {
      after = `${stage.ps_to} PS · ${stage.nm_to ?? "?"} Nm${extraNames ? " · " + extraNames : ""}`;
    } else if (motorItems.length > 0) {
      after = motorItems.map((i) => displayName(i, locale)).join(", ");
    } else {
      after = advice;
    }
    const power = buildPowerBeforeAfter(input.seriesPs, input.seriesNm, stage?.ps_to, stage?.nm_to) ?? undefined;
    rows.push({ id: "leistung", label: b.rows.leistung, before, after, power, extras: stage ? extraNames : undefined });
  }

  if (input.categories.includes("auspuff")) {
    rows.push({
      id: "sound",
      label: b.rows.sound,
      before: b.seriesExhaustValue,
      after: joinNames(itemsOf(input.items, "auspuff"), advice, locale),
    });
  }

  if (input.categories.includes("fahrwerk")) {
    rows.push({
      id: "fahrwerk",
      label: b.rows.fahrwerk,
      before: b.seriesHeightValue,
      after: joinNames(itemsOf(input.items, "fahrwerk"), advice, locale),
    });
  }

  if (input.categories.includes("raeder")) {
    rows.push({
      id: "raeder",
      label: b.rows.raeder,
      before: b.seriesWheelsValue,
      after: joinNames(itemsOf(input.items, "raeder"), advice, locale),
    });
  }

  if (input.categories.includes("exterieur")) {
    rows.push({
      id: "exterieur",
      label: b.rows.exterieur,
      before: b.seriesValue,
      after: joinNames(itemsOf(input.items, "exterieur"), advice, locale),
    });
  }

  if (input.categories.includes("interieur")) {
    rows.push({
      id: "interieur",
      label: b.rows.interieur,
      before: b.seriesValue,
      after: joinNames(itemsOf(input.items, "interieur"), advice, locale),
    });
  }

  const characterOption = t.steps.character.options.find((o) => o.id === input.character);
  rows.push({
    id: "charakter",
    label: b.rows.charakter,
    before: b.seriesFactoryValue,
    after: characterOption ? characterOption.title : advice,
  });

  return rows;
}
