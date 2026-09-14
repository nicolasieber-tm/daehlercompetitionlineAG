// GET/POST /api/cron/follow-ups: sendet fällige Follow-ups (Posten 6).
// Header `Authorization: Bearer <CRON_SECRET>`, sonst 401 (siehe
// docs/architektur.md, Abschnitt "Follow-ups", und Ordnerstruktur:
// "GET/POST, Header Authorization: Bearer $CRON_SECRET"). Aufgerufen von
// Railway Cron (Produktion) oder scripts/cron-followups.ts (lokal/manuell).
// GET und POST bewusst identisch: manche Cron-Anbieter (u.a. einfache
// curl-basierte Konfigurationen) senden GET, Railway Cron sowie
// scripts/cron-followups.ts senden POST.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDueFollowUps } from "@/lib/followups/run";

/**
 * Prüft den Authorization-Header zeitkonstant gegen `Bearer <CRON_SECRET>`.
 * Ohne gesetztes CRON_SECRET ist die Route grundsätzlich nicht aufrufbar
 * (kein Fallback-Geheimnis), damit ein vergessenes .env nicht versehentlich
 * eine offene Route ergibt.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const actual = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);

  // timingSafeEqual verlangt gleich lange Buffer, sonst wirft sie. Ein
  // Längenunterschied ist selbst schon ein eindeutiges "nicht autorisiert"
  // und muss nicht mehr zeitkonstant verglichen werden (die Kopfzeile ist
  // ohnehin öffentlich einsehbares Format, nicht das Geheimnis selbst).
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const result = await runDueFollowUps();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Follow-ups konnten nicht verarbeitet werden.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
