// Anfrage anlegen, siehe docs/architektur.md Abschnitt "Anfrage anlegen"
// (Schritte 1-9) und CLAUDE.md Abschnitt "Kundenflow". Einziger Schreibweg
// für neue Anfragen, genutzt von app/api/inquiries/route.ts (source "web")
// und künftig vom Schnellweg-Admin (source "quick", Posten 3, nicht Teil
// dieser Aufgabe).
import { sql } from "@/lib/db/client";
import { getFamilyBySlug, getProductsByIds, getProductsForModel } from "@/lib/catalog/queries";
import { bodyStyleFromText, isBodyStyle } from "@/lib/catalog/body-style";
import { isDrive } from "@/lib/catalog/drive";
import { vehicleLineOptions } from "@/lib/catalog/vehicle-label";
import { getSettings, sendInquiryMail, vehicleLabel } from "@/lib/mail";
import type { BodyStyle, Character, Drive, FlowCategory, Model, ModelFamily, PriceStatus, Timing } from "@/lib/db/rows";
import { runChecks } from "@/lib/rules/checks";
import type { CheckContext, CheckResult } from "@/lib/rules/checks";
import { buildDraft } from "@/lib/draft/template";
import type { DraftContext, DraftItem } from "@/lib/draft/template";
import { polishDraft } from "@/lib/draft/polish";
import { generateShareToken } from "./share";
import { buildMailContext } from "./context";
import { collectSourceTexts } from "@/lib/translations/texts";
import { getTranslationMap } from "@/lib/translations/store";
import { pickTranslations } from "@/lib/translations/resolve";
import type { TranslationMap } from "@/lib/translations/resolve";
import type { InquiryPayload } from "./schema";

/**
 * Zod validiert nur die Form des Payloads (siehe lib/inquiry/schema.ts),
 * nicht ob familyId/modelId/selections wirklich zueinander passen. Wer das
 * verletzt (falsches Produkt, Modell einer anderen Familie, manipulierte
 * IDs), bekommt diesen Fehler; app/api/inquiries/route.ts übersetzt ihn in
 * HTTP 400 "ungültige Auswahl" (siehe docs/architektur.md Anfrage anlegen,
 * Schritt 2).
 */
export class InvalidSelectionError extends Error {
  constructor(message = "ungültige Auswahl") {
    super(message);
    this.name = "InvalidSelectionError";
  }
}

export interface CreateInquiryResult {
  id: string;
  number: string;
  shareToken: string;
  estimatedTotal: number | null;
  checks: CheckResult[];
  draft: { subject: string; body: string };
}

interface SelectedProduct {
  productId: string;
  category: FlowCategory;
  name: string;
  description: string | null;
  priceTotal: number | null;
  priceStatus: PriceStatus;
  psTo: number | null;
  nmTo: number | null;
  variantGroup: string | null;
  bodyStyles: BodyStyle[];
  drive: Drive | null;
}

/**
 * Legt eine Anfrage an: Produkte serverseitig nachladen und gegen Familie/
 * Modell validieren, Nummer vergeben, Prüfhinweise und Antwortentwurf
 * berechnen, Richtsumme bilden, speichern, Mails verschicken. Preise kommen
 * ausschliesslich aus der DB (getProductsByIds/getProductsForModel), nie
 * aus payload.selections (das trägt nur productId, siehe
 * lib/inquiry/schema.ts).
 *
 * opts.source unterscheidet den Kundenflow ("web") vom Schnellweg ("quick",
 * Posten 3); opts.sendCustomerMail ist bei "web" true, beim Schnellweg
 * false (der Admin prüft/bearbeitet den Entwurf zuerst, siehe
 * docs/architektur.md Abschnitt "Posten 3, Schnellweg": "danach derselbe
 * Weg wie eine Tool-Anfrage (ohne Bestätigungsmail an den Kunden)").
 *
 * Gibt auch bei einem Mailfehler ok zurück (Anfrage ist dann bereits
 * gespeichert, siehe docs/architektur.md: "Mailfehler dürfen die Anfrage
 * nicht verlieren").
 */
export async function createInquiry(
  payload: InquiryPayload,
  opts: { source: "web" | "quick"; sendCustomerMail: boolean },
): Promise<CreateInquiryResult> {
  // 1. Familie laden (auch für Kurzablauf-Platzhalter wie Wiesmann, siehe
  // CLAUDE.md "Modelle ohne Preisliste") - familyId ist immer Pflicht,
  // unabhängig davon, ob ein Modell gewählt wurde.
  const [family] = await sql<ModelFamily[]>`
    select * from model_families where id = ${payload.familyId} and active = true
  `;
  if (!family) throw new InvalidSelectionError();

  // 2. Produkte per getProductsByIds nachladen, nur Produkte behalten, die
  // zur Familie gehören und das Modell fitten (sonst 400 "ungültige
  // Auswahl", siehe docs/architektur.md Anfrage anlegen). getProductsForModel
  // liefert genau die Menge gültiger Produkt-IDs für familyId+modelId
  // zusammen (fits_all oder product_fitment, siehe lib/catalog/queries.ts);
  // getProductsByIds liefert die vollständigen, serverseitigen Preisdaten.
  let model: Model | null = null;
  const selected: SelectedProduct[] = [];

  if (payload.modelId) {
    const [[modelRow], fitting] = await Promise.all([
      sql<Model[]>`select * from models where id = ${payload.modelId} and active = true`,
      getProductsForModel(payload.modelId),
    ]);
    if (!modelRow || !fitting || fitting.family.id !== payload.familyId) {
      throw new InvalidSelectionError();
    }
    model = modelRow;

    if (payload.selections.length > 0) {
      const allowedIds = new Set(fitting.groups.flatMap((g) => g.products.map((p) => p.id)));
      // Mehrfach angefragte productId zählt nur einmal: eine Position wird
      // gewählt oder nicht, keine Mengenangabe im Flow (siehe CLAUDE.md
      // Kundenflow Schritt 3).
      const uniqueIds = [...new Set(payload.selections.map((s) => s.productId))];
      const products = await getProductsByIds(uniqueIds);
      const byId = new Map(products.map((p) => [p.id, p]));

      for (const id of uniqueIds) {
        if (!byId.has(id) || !allowedIds.has(id)) throw new InvalidSelectionError();
      }

      for (const id of uniqueIds) {
        const p = byId.get(id)!;
        selected.push({
          productId: p.id,
          category: p.category,
          name: p.name,
          description: p.description,
          priceTotal: p.priceTotal,
          priceStatus: p.priceStatus,
          psTo: p.psTo,
          nmTo: p.nmTo,
          variantGroup: p.variantGroup,
          bodyStyles: p.bodyStyles,
          drive: p.drive,
        });
      }
    }
  } else if (payload.selections.length > 0) {
    // Durch lib/inquiry/schema.ts bereits ausgeschlossen (Kurzablauf ohne
    // Modell darf keine Produktauswahl haben); defensiv nochmals geprüft,
    // falls createInquiry künftig mit einem selbst gebauten Payload aus dem
    // Schnellweg aufgerufen wird (siehe docs/architektur.md "Posten 3").
    throw new InvalidSelectionError();
  }

  // 3b. Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
  // Motorisierungen, das Modell ist X1 oder X2"): payload.line erneut gegen
  // die AKTUELLEN Optionen prüfen (können sich seit dem Laden des Flows
  // geändert haben, z.B. durch einen neuen Import) statt ihn ungeprüft zu
  // übernehmen - ein ungültiger/veralteter Wert wird zu null (verhält sich
  // dann wie unbeantwortet, siehe vehicleDisplayLabel()/runChecks()).
  const line =
    payload.line && model
      ? (vehicleLineOptions(
          { brand: family.brand, name: family.name, codes: family.codes },
          { name: model.name },
        ).some((option) => option.id === payload.line)
          ? payload.line
          : null)
      : null;

  // 3c. Entscheid 21.09.2026 (Karosserieform/Antrieb): die gewählte
  // Karosserieform gilt nur, wenn das Modell sie als Option führt
  // (CatalogModel.bodyStyleOptions, die Vereinigung der Karosserieformen
  // seiner karosseriespezifischen Produkte) ODER sie aus der gültigen
  // Modellwahl folgt («Cabrio» bei 4er G22/G23/G26) - alles andere wird zu
  // null (Frage nicht gestellt / nicht beantwortbar). Antrieb analog.
  let bodyStyle: BodyStyle | null = null;
  let drive: Drive | null = null;
  if (model) {
    const catalogFamily = await getFamilyBySlug(family.slug);
    const catalogModel = catalogFamily?.models.find((m) => m.id === model!.id) ?? null;
    const lineLabel = line
      ? vehicleLineOptions(
          { brand: family.brand, name: family.name, codes: family.codes },
          { name: model.name },
        ).find((option) => option.id === line)?.label ?? null
      : null;
    const fromLine = bodyStyleFromText(lineLabel);
    if (fromLine) {
      bodyStyle = fromLine;
    } else if (isBodyStyle(payload.bodyStyle) && catalogModel?.bodyStyleOptions.includes(payload.bodyStyle)) {
      bodyStyle = payload.bodyStyle;
    }
    if (isDrive(payload.drive) && catalogModel?.driveOptions.includes(payload.drive)) {
      drive = payload.drive;
    }
  }

  // 4. Prüfhinweise.
  const checkCtx: CheckContext = {
    inquiry: {
      categories: payload.categories,
      consulting: payload.consulting,
      character: payload.character as Character,
      timing: payload.timing as Timing,
      year: payload.year,
      gearbox: payload.gearbox,
      line,
      bodyStyle,
      drive,
    },
    family: { hasPricelist: family.has_pricelist, brand: family.brand, name: family.name, codes: family.codes },
    model: model ? { id: model.id, name: model.name } : null,
    products: selected.map((p) => ({
      category: p.category,
      name: p.name,
      // Korrektur 15.09.2026 (Prüfung Modul Parser, Befund 2): checks.ts
      // isVmaxMentionOf() prüft jetzt auch die description (einige V/max-
      // Nennungen stehen nur dort, siehe lib/catalog/product-display.ts).
      description: p.description,
      variantGroup: p.variantGroup,
      priceStatus: p.priceStatus,
      psTo: p.psTo,
      bodyStyles: p.bodyStyles,
      drive: p.drive,
    })),
  };
  const checks = runChecks(checkCtx, payload.locale);

  // 5. Richtsumme: Summe price_total der priced-Produkte (siehe
  // docs/architektur.md Kundenflow: "Richtsumme = Summe price_total der
  // gewählten Produkte"), null statt 0 ohne jede geprisste Position (sonst
  // zeigt der Entwurf/die Mail fälschlich "CHF 0" statt "auf Anfrage").
  const pricedItems = selected.filter((p) => p.priceStatus === "priced" && p.priceTotal != null);
  const estimatedTotal = pricedItems.length > 0 ? pricedItems.reduce((sum, p) => sum + (p.priceTotal ?? 0), 0) : null;

  // 6. Antwortentwurf: settings ausserhalb der Transaktion gelesen (reiner
  // Read, gecacht über lib/mail/settings.ts getSettings()). Die Nummer
  // selbst kommt erst unten aus der Transaktion (next_inquiry_number()); der
  // Entwurf wird deshalb dort gebaut, weil sein Betreff die Nummer enthält.
  const settings = await getSettings();
  const draftSettings = {
    signatureName: settings.signature_name || "dÄHLer Competition Line AG",
    // Prüfung, Befund 4: companyName (settings.mail_from_name) fehlte hier
    // bisher, buildDraft() fiel deshalb auf companyAddress allein zurück
    // (siehe DraftSettings/companyLine()-Kommentar in lib/draft/template.ts).
    // companyLine() dedupliziert selbst, falls company_address den
    // Firmennamen bereits als Anfang enthält (wie der ausgelieferte
    // Seed-Wert "dÄHLer Competition Line AG, Belp").
    companyName: settings.mail_from_name || "dÄHLer Competition Line AG",
    companyAddress: settings.company_address || "dÄHLer Competition Line AG, Belp",
    signaturePhone: settings.signature_phone || "",
  };
  const draftItems: DraftItem[] = selected.map((p) => ({
    category: p.category,
    name: p.name,
    description: p.description,
    priceTotal: p.priceTotal,
    priceStatus: p.priceStatus,
    psTo: p.psTo,
    nmTo: p.nmTo,
    variantGroup: p.variantGroup,
  }));

  // 6b. Entscheid 21.09.2026 (Posten 4): Übersetzungen der gewählten
  // Positionstexte einfrieren (inquiries.translations, wie name/price_total
  // in selections): Bestätigungsmail, Teilen-Seite und Antwortentwurf einer
  // englischen Anfrage bleiben so stabil, auch wenn ein Eintrag später im
  // Admin korrigiert wird. Unabhängig von payload.locale gesammelt (klein,
  // und die Teilen-Seite folgt inquiry.locale), null ohne Einträge.
  const itemSourceTexts = collectSourceTexts({
    products: selected.map((p) => ({
      name: p.name,
      description: p.description,
      variant_group: p.variantGroup,
      ps_to: p.psTo,
      nm_to: p.nmTo,
    })),
  }).map((t) => t.text);
  const enTranslations: TranslationMap =
    itemSourceTexts.length > 0 ? pickTranslations(await getTranslationMap("en", itemSourceTexts), itemSourceTexts) : {};
  const translationsJson = Object.keys(enTranslations).length > 0 ? { en: enTranslations } : null;
  const draftTranslations = payload.locale === "en" && translationsJson ? enTranslations : null;

  // 7. Teilen-Token.
  const shareToken = generateShareToken();

  // ps_to/nm_to mit persistiert (Prüfung, Befund 4): ohne sie kennt
  // lib/inquiry/context.ts parseItems() sie beim späteren Mailversand nicht
  // mehr (inquiries.selections ist die einzige Quelle danach, die Produkte
  // selbst werden nicht erneut geladen) - die ZIEL-Zeile der Inbox-Mail
  // (lib/mail/templates/inbox.ts goalLine()) fiele dann auf die description
  // zurück statt "ca. 620 PS / 740 Nm" zu zeigen. variant_group ebenso mit
  // persistiert (Korrektur 15.09.2026, Prüfung Modul Produkte, Befund 2):
  // ohne sie fällt lib/catalog/product-display.ts isStageItem() beim
  // späteren Mailversand auf die ungenaue ps_to!=null-Herleitung zurück (13
  // aktive Stufen ohne ps_to würden dann in confirmation-/summary-/
  // inbox-Mail fälschlich nicht als Stufe erkannt, siehe Bericht).
  const selectionsJson = selected.map((p) => ({
    product_id: p.productId,
    category: p.category,
    name: p.name,
    description: p.description,
    price_total: p.priceTotal,
    price_status: p.priceStatus,
    ps_to: p.psTo,
    nm_to: p.nmTo,
    variant_group: p.variantGroup,
  }));

  // 8. Nummer und Insert in einer Transaktion: next_inquiry_number() erhöht
  // den Jahreszähler unwiderruflich; ohne Transaktion würde ein danach
  // fehlschlagender Insert eine Nummer verbrauchen, ohne dass je eine
  // Anfrage mit dieser Nummer existiert (Nummerierungslücke). Der Entwurf
  // (braucht die Nummer im Betreff) wird deshalb hier, innerhalb der
  // Transaktion, gebaut statt vorher.
  const { inquiryId, number, draft } = await sql.begin(async (tx) => {
    const [{ next_inquiry_number: number }] = await tx<{ next_inquiry_number: string }[]>`
      select next_inquiry_number()
    `;

    const draftCtx: DraftContext = {
      number,
      firstName: payload.firstName,
      lastName: payload.lastName,
      vehicleLabel: vehicleLabel({ family, model, vehicleText: payload.vehicleText, line }),
      year: payload.year,
      character: payload.character as Character,
      categories: payload.categories,
      consulting: payload.consulting,
      timing: payload.timing as Timing,
      hasPricelist: family.has_pricelist,
      items: draftItems,
      estimatedTotal,
      settings: draftSettings,
      translations: draftTranslations,
    };
    const deterministicDraft = buildDraft(draftCtx, payload.locale);
    // Optionales Glätten (lib/draft/polish.ts): no-op ohne
    // ANTHROPIC_API_KEY/DRAFT_POLISH=1, liefert sonst unverändert
    // deterministicDraft.body zurück.
    const polishedBody = await polishDraft(deterministicDraft.body, payload.locale);
    const draft = { subject: deterministicDraft.subject, body: polishedBody };

    // checks (CheckResult[], ein benanntes Interface ohne Indexsignatur)
    // erfüllt sql.json()s JSONValue-Parametertyp nicht strukturell (fehlende
    // Indexsignatur); der JSON-Rundtrip macht daraus ein plain object,
    // inhaltlich identisch (CheckResult ist bereits eine reine {id, text}-
    // Struktur).
    const [inserted] = await tx<{ id: string }[]>`
      insert into inquiries (
        number, status, source, locale, family_id, model_id, vehicle_text, year, been_here, gearbox,
        series_ps, line, body_style, drive, categories, consulting, selections, follow_up_answers, character, timing,
        first_name, last_name, city, phone, email, channel, message, estimated_total, checks,
        draft_subject, draft_reply, share_token, translations
      ) values (
        ${number}, 'neu', ${opts.source}, ${payload.locale}, ${payload.familyId}, ${payload.modelId},
        ${payload.vehicleText}, ${payload.year}, ${payload.beenHere}, ${payload.gearbox},
        ${payload.seriesPs}, ${line}, ${bodyStyle}, ${drive}, ${payload.categories}, ${payload.consulting}, ${sql.json(selectionsJson)},
        ${sql.json(payload.followUpAnswers)}, ${payload.character}, ${payload.timing},
        ${payload.firstName}, ${payload.lastName}, ${payload.city}, ${payload.phone}, ${payload.email},
        ${payload.channel}, ${payload.message || null}, ${estimatedTotal}, ${sql.json(JSON.parse(JSON.stringify(checks)))},
        ${draft.subject}, ${draft.body}, ${shareToken},
        ${translationsJson ? sql.json(translationsJson) : null}
      )
      returning id
    `;

    return { inquiryId: inserted.id, number, draft };
  });

  // 9. Mails: Bestätigung (nur wenn opts.sendCustomerMail) und Anfrage-Mail
  // an settings.mail_inbox. Mailfehler werden nur protokolliert (siehe
  // sendInquiryMail()/sendMail(), die laut lib/mail/resend.ts nie nach
  // aussen werfen); der try/catch hier fängt zusätzlich einen Fehler beim
  // Aufbau des Kontexts (buildMailContext) ab - die Anfrage ist zu diesem
  // Zeitpunkt bereits gespeichert und muss auf jeden Fall zurückgegeben
  // werden.
  try {
    const mailCtx = await buildMailContext(inquiryId);
    if (opts.sendCustomerMail) {
      const confirmationResult = await sendInquiryMail("confirmation", mailCtx);
      if (!confirmationResult.ok) {
        console.error(`createInquiry: Bestätigungsmail fehlgeschlagen (Anfrage ${number}):`, confirmationResult.error);
      }
    }
    const inboxResult = await sendInquiryMail("inbox", mailCtx);
    if (!inboxResult.ok) {
      console.error(`createInquiry: Anfrage-Mail fehlgeschlagen (Anfrage ${number}):`, inboxResult.error);
    }
  } catch (err) {
    console.error(`createInquiry: Mailversand fehlgeschlagen (Anfrage ${number}).`, err);
  }

  return { id: inquiryId, number, shareToken, estimatedTotal, checks, draft };
}
