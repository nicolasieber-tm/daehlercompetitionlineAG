// GET/POST /api/cron/follow-ups: manueller Auslöser für fällige Follow-ups
// (Posten 6), z. B. Admin "Fällige jetzt senden" oder
// scripts/cron-followups.ts. Header `Authorization: Bearer <CRON_SECRET>`,
// sonst 401 (siehe docs/architektur.md, Abschnitt "Follow-ups"). Der
// eigentliche automatische Versand läuft über lib/followups/scheduler.ts
// (siehe instrumentation.ts, docs/umbau-railway.md: "kein Cron-Dienst,
// Follow-ups in der App") - diese Route verwendet dieselbe
// Postgres-Advisory-Lock-Logik (runFollowUpsWithLock()), damit ein
// manueller Aufruf nie parallel zu einem automatischen Lauf sendet. Läuft
// der Scheduler (oder ein anderer manueller Aufruf) gerade, liefert diese
// Route `{ ok: true, skipped: "locked" }` statt zu warten oder doppelt zu
// senden.
// GET und POST bewusst identisch: manche Cron-Anbieter (u.a. einfache
// curl-basierte Konfigurationen) senden GET, Railway Cron sowie
// scripts/cron-followups.ts senden POST.
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runFollowUpsWithLock } from "@/lib/followups/scheduler";

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
    const outcome = await runFollowUpsWithLock();
    if (!outcome.ran) {
      return NextResponse.json({ ok: true, skipped: outcome.reason });
    }
    return NextResponse.json({ ok: true, ...outcome.result });
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
