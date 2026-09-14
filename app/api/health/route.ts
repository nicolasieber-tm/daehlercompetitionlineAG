import { NextResponse } from "next/server";

// GET /api/health: einfacher Health-Check ohne Abhängigkeiten (keine DB,
// kein Auth), zur Prüfung, dass die App läuft.
export function GET() {
  return NextResponse.json({ ok: true });
}
