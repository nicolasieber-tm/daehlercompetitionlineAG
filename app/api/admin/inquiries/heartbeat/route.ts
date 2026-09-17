// GET /api/admin/inquiries/heartbeat: leichtgewichtiger Polling-Endpunkt für
// components/admin/LiveRefresh.tsx (Übersicht /admin, siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkt 1). Liefert { ok, count, latestCreatedAt,
// newCount } - Gesamtzahl, jüngste created_at und Anzahl Status "neu"
// ALLER Anfragen, unabhängig von den Filtern der Übersicht. Nur für
// angemeldete Admins (getAdminUser(), wie bei jeder anderen /api/admin/*-
// Route, middleware.ts deckt die Session-Cookie-Prüfung bereits am Rand ab).
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/auth";
import { getInquiriesHeartbeat } from "@/lib/admin/inquiries";

export async function GET() {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }

  const heartbeat = await getInquiriesHeartbeat();
  return NextResponse.json(
    { ok: true, count: heartbeat.count, latestCreatedAt: heartbeat.latestCreatedAt, newCount: heartbeat.newCount },
    { headers: { "Cache-Control": "no-store" } },
  );
}
