// GET /api/p/[token]: öffentliche, read-only Daten für die Teilen-Ansicht
// einer Anfrage (app/p/[token]/page.tsx, CLAUDE.md Kundenflow Schritt 6
// "Paket als Link teilen"). Kein Login nötig, der Token selbst ist die
// Zugriffskontrolle (siehe lib/inquiry/share.ts).
import { NextResponse } from "next/server";
import { getInquiryByShareToken } from "@/lib/inquiry/share";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ ok: false, error: "Kein Token angegeben." }, { status: 400 });
  }

  try {
    const inquiry = await getInquiryByShareToken(token);
    if (!inquiry) {
      return NextResponse.json({ ok: false, error: "Nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json(
      { ok: true, inquiry },
      // Kurzes Caching: der Link wird oft mehrfach geöffnet (CLAUDE.md
      // "Paket als Link teilen"), Inhalt ändert sich nach dem Anlegen nicht
      // mehr.
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (err) {
    console.error(`GET /api/p/${token} fehlgeschlagen.`, err);
    return NextResponse.json({ ok: false, error: "Anfrage konnte nicht geladen werden." }, { status: 500 });
  }
}
