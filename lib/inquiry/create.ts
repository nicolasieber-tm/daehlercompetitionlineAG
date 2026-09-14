// Anfrage anlegen, siehe docs/architektur.md Abschnitt "Anfrage anlegen"
// (Schritte 1-9) und CLAUDE.md Abschnitt "Kundenflow". Einziger Schreibweg
// für neue Anfragen, genutzt von app/api/inquiries/route.ts (source "web")
// und künftig vom Schnellweg-Admin (source "quick", Posten 3, nicht Teil
// dieser Aufgabe).
import { createAdminClient } from "@/lib/supabase/admin";
import { getProductsByIds, getProductsForModel } from "@/lib/catalog/queries";
import { getSettings, sendInquiryMail, vehicleLabel } from "@/lib/mail";
import type { Json } from "@/lib/supabase/database.types";
import type { Character, FlowCategory, Model, PriceStatus, Timing } from "@/lib/supabase/rows";
import { runChecks } from "@/lib/rules/checks";
import type { CheckContext, CheckResult } from "@/lib/rules/checks";
import { buildDraft } from "@/lib/draft/template";
import type { DraftContext, DraftItem } from "@/lib/draft/template";
import { polishDraft } from "@/lib/draft/polish";
import { generateShareToken } from "./share";
import { buildMailContext } from "./context";
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
  const admin = createAdminClient();

  // 1. Familie laden (auch für Kurzablauf-Platzhalter wie Wiesmann, siehe
  // CLAUDE.md "Modelle ohne Preisliste") - familyId ist immer Pflicht,
  // unabhängig davon, ob ein Modell gewählt wurde.
  const { data: family, error: familyError } = await admin
    .from("model_families")
    .select("*")
    .eq("id", payload.familyId)
    .eq("active", true)
    .maybeSingle();
  if (familyError) {
    throw new Error(`createInquiry: Familie konnte nicht geladen werden: ${familyError.message}`);
  }
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
    const [modelRes, fitting] = await Promise.all([
      admin.from("models").select("*").eq("id", payload.modelId).eq("active", true).maybeSingle(),
      getProductsForModel(payload.modelId, admin),
    ]);
    if (modelRes.error) {
      throw new Error(`createInquiry: Modell konnte nicht geladen werden: ${modelRes.error.message}`);
    }
    if (!modelRes.data || !fitting || fitting.family.id !== payload.familyId) {
      throw new InvalidSelectionError();
    }
    model = modelRes.data;

    if (payload.selections.length > 0) {
      const allowedIds = new Set(fitting.groups.flatMap((g) => g.products.map((p) => p.id)));
      // Mehrfach angefragte productId zählt nur einmal: eine Position wird
      // gewählt oder nicht, keine Mengenangabe im Flow (siehe CLAUDE.md
      // Kundenflow Schritt 3).
      const uniqueIds = [...new Set(payload.selections.map((s) => s.productId))];
      const products = await getProductsByIds(uniqueIds, admin);
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

  // 3. Anfragenummer, siehe docs/db.md next_inquiry_number() (nur für
  // service_role ausführbar).
  const { data: number, error: numberError } = await admin.rpc("next_inquiry_number");
  if (numberError || !number) {
    throw new Error(`createInquiry: Anfragenummer konnte nicht vergeben werden: ${numberError?.message ?? "leere Antwort"}`);
  }

  // 4. Prüfhinweise.
  const checkCtx: CheckContext = {
    inquiry: {
      categories: payload.categories,
      consulting: payload.consulting,
      character: payload.character as Character,
      timing: payload.timing as Timing,
      year: payload.year,
    },
    family: { hasPricelist: family.has_pricelist },
    model: model ? { id: model.id, name: model.name } : null,
    products: selected.map((p) => ({
      category: p.category,
      name: p.name,
      variantGroup: p.variantGroup,
      priceStatus: p.priceStatus,
      psTo: p.psTo,
    })),
  };
  const checks = runChecks(checkCtx, payload.locale);

  // 5. Richtsumme: Summe price_total der priced-Produkte (siehe
  // docs/architektur.md Kundenflow: "Richtsumme = Summe price_total der
  // gewählten Produkte"), null statt 0 ohne jede geprisste Position (sonst
  // zeigt der Entwurf/die Mail fälschlich "CHF 0" statt "auf Anfrage").
  const pricedItems = selected.filter((p) => p.priceStatus === "priced" && p.priceTotal != null);
  const estimatedTotal = pricedItems.length > 0 ? pricedItems.reduce((sum, p) => sum + (p.priceTotal ?? 0), 0) : null;

  // 6. Antwortentwurf.
  const settings = await getSettings();
  const draftCtx: DraftContext = {
    number,
    firstName: payload.firstName,
    lastName: payload.lastName,
    vehicleLabel: vehicleLabel({ family, model, vehicleText: payload.vehicleText }),
    year: payload.year,
    character: payload.character as Character,
    categories: payload.categories,
    consulting: payload.consulting,
    timing: payload.timing as Timing,
    hasPricelist: family.has_pricelist,
    items: selected.map(
      (p): DraftItem => ({
        category: p.category,
        name: p.name,
        description: p.description,
        priceTotal: p.priceTotal,
        priceStatus: p.priceStatus,
        psTo: p.psTo,
        nmTo: p.nmTo,
        variantGroup: p.variantGroup,
      }),
    ),
    estimatedTotal,
    settings: {
      signatureName: settings.signature_name || "dÄHLer Competition Line AG",
      // Prüfung, Befund 4: companyName (settings.mail_from_name) fehlte
      // hier bisher, buildDraft() fiel deshalb auf companyAddress allein
      // zurück (siehe DraftSettings/companyLine()-Kommentar in
      // lib/draft/template.ts). companyLine() dedupliziert selbst, falls
      // company_address den Firmennamen bereits als Anfang enthält (wie der
      // ausgelieferte Seed-Wert "dÄHLer Competition Line AG, Belp").
      companyName: settings.mail_from_name || "dÄHLer Competition Line AG",
      companyAddress: settings.company_address || "dÄHLer Competition Line AG, Belp",
      signaturePhone: settings.signature_phone || "",
    },
  };
  const deterministicDraft = buildDraft(draftCtx, payload.locale);
  // Optionales Glätten (lib/draft/polish.ts): no-op ohne ANTHROPIC_API_KEY/
  // DRAFT_POLISH=1, liefert sonst unverändert deterministicDraft.body zurück.
  const polishedBody = await polishDraft(deterministicDraft.body, payload.locale);
  const draft = { subject: deterministicDraft.subject, body: polishedBody };

  // 7. Teilen-Token.
  const shareToken = generateShareToken();

  // 8. Speichern. ps_to/nm_to mit persistiert (Prüfung, Befund 4): ohne sie
  // kennt lib/inquiry/context.ts parseItems() sie beim späteren Mailversand
  // nicht mehr (inquiries.selections ist die einzige Quelle danach, die
  // Produkte selbst werden nicht erneut geladen) - die ZIEL-Zeile der
  // Inbox-Mail (lib/mail/templates/inbox.ts goalLine()) fiele dann auf die
  // description zurück statt "ca. 620 PS / 740 Nm" zu zeigen.
  const selectionsJson = selected.map((p) => ({
    product_id: p.productId,
    category: p.category,
    name: p.name,
    description: p.description,
    price_total: p.priceTotal,
    price_status: p.priceStatus,
    ps_to: p.psTo,
    nm_to: p.nmTo,
  }));

  const { data: inserted, error: insertError } = await admin
    .from("inquiries")
    .insert({
      number,
      status: "neu",
      source: opts.source,
      locale: payload.locale,
      family_id: payload.familyId,
      model_id: payload.modelId,
      vehicle_text: payload.vehicleText,
      year: payload.year,
      been_here: payload.beenHere,
      categories: payload.categories,
      consulting: payload.consulting,
      selections: selectionsJson,
      follow_up_answers: payload.followUpAnswers,
      character: payload.character,
      timing: payload.timing,
      first_name: payload.firstName,
      last_name: payload.lastName,
      city: payload.city,
      phone: payload.phone,
      email: payload.email,
      channel: payload.channel,
      message: payload.message || null,
      estimated_total: estimatedTotal,
      // CheckResult[] -> Json: CheckResult ist ein benanntes Interface ohne
      // Indexsignatur, jsonb in database.types.ts erwartet Json (siehe
      // lib/supabase/database.types.ts). Strukturell identisch (plain
      // {id, text}-Objekte), der Cast ist rein für den Compiler.
      checks: checks as unknown as Json,
      draft_subject: draft.subject,
      draft_reply: draft.body,
      share_token: shareToken,
    })
    .select("id")
    .single();
  if (insertError) {
    throw new Error(`createInquiry: Anfrage konnte nicht gespeichert werden: ${insertError.message}`);
  }
  const inquiryId = inserted.id;

  // 9. Mails: Bestätigung (nur wenn opts.sendCustomerMail) und Anfrage-Mail
  // an settings.mail_inbox. Mailfehler werden nur protokolliert (siehe
  // sendInquiryMail()/sendMail(), die laut lib/mail/resend.ts nie nach
  // aussen werfen); der try/catch hier fängt zusätzlich einen Fehler beim
  // Aufbau des Kontexts (buildMailContext) ab - die Anfrage ist zu diesem
  // Zeitpunkt bereits gespeichert und muss auf jeden Fall zurückgegeben
  // werden.
  try {
    const mailCtx = await buildMailContext(inquiryId, admin);
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
