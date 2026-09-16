// POST /api/admin/quick/extract: Posten 3, Schnellweg, erster Schritt
// ("Auswerten", siehe CLAUDE.md "Admin", Abschnitt Schnellweg). Nur für
// angemeldete Admins, sonst 401. Session-Prüfung bleibt requireAdmin()
// (lib/admin/auth.ts), wie an allen anderen Admin-Stellen - der Umbau auf
// better-auth (Phase E2, siehe docs/umbau-railway.md) ändert an dieser
// Aufrufstelle nichts.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/auth";
import { extractInquiry } from "@/lib/ai/extract";

const bodySchema = z.object({
  text: z.string().trim().min(1, "text darf nicht leer sein."),
  locale: z.enum(["de", "en"]).optional(),
});

export async function POST(request: Request) {
  // getAdminUser() statt requireAdmin(): requireAdmin() leitet ohne Session
  // per next/navigation redirect() um (für Pages/Server Actions gedacht),
  // ein Route Handler soll stattdessen 401 JSON liefern (middleware.ts
  // schützt /api/admin/* bereits am Rand, das hier ist Defense in Depth).
  const user = await getAdminUser();
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
