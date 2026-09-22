import { NextResponse } from "next/server";
import { sql } from "@/lib/db/client";

// GET /api/health: Health-Check für Railway (.railway/railway.ts,
// deploy.healthcheckPath). Prüft die DB-Verbindung mit einem einfachen `select 1`
// (kein Auth nötig, keine Abhängigkeit von better-auth/Resend/Anthropic) -
// ohne funktionierende DB kann die App ohnehin nichts Sinnvolles tun
// (Katalog, Anfragen, Login laufen alle über lib/db/client.ts). Liefert
// { ok: true, db: true } bei Erfolg, sonst 503 { ok: false, db: false }.
export async function GET() {
  try {
    await sql`select 1`;
    return NextResponse.json({ ok: true, db: true });
  } catch (error) {
    console.error("GET /api/health: DB-Zugriff fehlgeschlagen.", error);
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
