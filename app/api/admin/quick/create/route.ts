// POST /api/admin/quick/create: Posten 3, Schnellweg, zweiter Schritt
// ("Anfrage anlegen" nach Prüfung/Korrektur durch den Admin, siehe
// docs/architektur.md "Posten 3, Schnellweg"). source=quick,
// sendCustomerMail=false (keine Bestätigungsmail an den Kunden für diesen
// Weg, siehe CLAUDE.md "Mailversand"/"Antwortentwurf"). Nur für
// angemeldete Admins, sonst 401.
//
// Nutzt lib/inquiry/create.ts createInquiry() - denselben Schreibweg wie
// der Kundenflow (POST /api/inquiries) - statt des früheren Adapters
// (lib/ai/adapter.ts, entfernt, siehe Prüfbericht Befund #1): dadurch
// entstehen jetzt auch beim Schnellweg Prüfhinweise, ein Antwortentwurf und
// die Anfrage-Mail an info@, und die Produktauswahl wird gegen Familie/
// Modell-Fitment geprüft (Befund #2).
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractionSchema } from "@/lib/ai/extract";
import { toInquiryPayload } from "@/lib/ai/to-payload";
import { createInquiry, InvalidSelectionError } from "@/lib/inquiry/create";
import { FLOW_CATEGORIES, type FlowCategory } from "@/lib/supabase/rows";
import type { Json } from "@/lib/supabase/database.types";

const extractionWithUncertainSchema = extractionSchema.extend({
  uncertain: z.array(z.string()),
});

const flowCategoryEnum = z.enum(FLOW_CATEGORIES as [FlowCategory, ...FlowCategory[]]);

// Spiegelt lib/ai/to-payload.ts QuickOverrides: vom Admin im UI nachgetragene
// Korrekturen, alle Felder optional (nur die tatsächlich korrigierten werden
// mitgeschickt).
const overridesSchema = z.object({
  locale: z.enum(["de", "en"]).optional(),
  familySlug: z.string().min(1).nullable().optional(),
  modelSlug: z.string().min(1).nullable().optional(),
  vehicleText: z.string().nullable().optional(),
  year: z.string().nullable().optional(),
  beenHere: z.boolean().optional(),
  categories: z.array(flowCategoryEnum).optional(),
  consulting: z.boolean().optional(),
  selections: z.array(z.object({ productId: z.string().min(1) })).optional(),
  character: z.enum(["dezent", "sportlich", "maximum"]).nullable().optional(),
  timing: z.enum(["asap", "m1_2", "m3_6", "flexible"]).nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  channel: z.enum(["phone", "email", "whatsapp"]).nullable().optional(),
  message: z.string().nullable().optional(),
});

const bodySchema = z.object({
  // Ausgangstext (derselbe wie bei POST /api/admin/quick/extract), für
  // inquiries.raw_text (siehe docs/architektur.md Datenmodell: "raw_text
  // text (Schnellweg)").
  text: z.string().trim().min(1, "text darf nicht leer sein."),
  extraction: extractionWithUncertainSchema,
  overrides: overridesSchema.optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültiges JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }

  const { ok, payload, missing } = await toInquiryPayload(parsed.data.extraction, parsed.data.overrides);
  if (!ok || !payload) {
    return NextResponse.json(
      { ok: false, error: `Pflichtfelder fehlen oder sind ungültig: ${missing.join(", ")}`, missing },
      { status: 422 },
    );
  }

  try {
    const result = await createInquiry(payload, { source: "quick", sendCustomerMail: false });

    // raw_text/ai_extraction speichern (docs/architektur.md Datenmodell):
    // kein Teil von lib/inquiry/create.ts (das kennt nur den Kundenflow-
    // Payload ohne diese beiden Felder), daher als sekundärer Schreib-
    // zugriff über den Service-Role-Client nachgetragen. Ein Fehler hier
    // darf die bereits angelegte Anfrage nicht verlieren (wie bei den
    // Mails in lib/inquiry/create.ts), daher nur geloggt.
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from("inquiries")
      .update({
        raw_text: parsed.data.text,
        ai_extraction: parsed.data.extraction as unknown as Json,
      })
      .eq("id", result.id);
    if (updateError) {
      console.error(
        `POST /api/admin/quick/create: raw_text/ai_extraction für Anfrage ${result.number} konnte nicht gespeichert werden.`,
        updateError,
      );
    }

    return NextResponse.json({ ok: true, id: result.id, number: result.number });
  } catch (error) {
    if (error instanceof InvalidSelectionError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Anfrage anlegen fehlgeschlagen.";
    console.error("POST /api/admin/quick/create fehlgeschlagen.", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
