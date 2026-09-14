// POST /api/admin/quick/extract: Posten 3, Schnellweg, erster Schritt
// ("Auswerten", siehe CLAUDE.md "Admin", Abschnitt Schnellweg). Nur für
// angemeldete Admins (Supabase-Session), sonst 401.
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { extractInquiry } from "@/lib/ai/extract";

const bodySchema = z.object({
  text: z.string().trim().min(1, "text darf nicht leer sein."),
  locale: z.enum(["de", "en"]).optional(),
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

  try {
    const extraction = await extractInquiry(parsed.data.text, parsed.data.locale);
    return NextResponse.json({ ok: true, extraction });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Extraktion fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
