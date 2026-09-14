// POST /api/inquiries: öffentlicher Endpunkt, mit dem der Kundenflow eine
// Anfrage abschickt (CLAUDE.md Kundenflow Schritt 5/6, docs/architektur.md
// Abschnitt "Anfrage anlegen"). Validiert den Payload, legt die Anfrage
// über lib/inquiry/create.ts an (source "web", Bestätigungsmail an den
// Kunden) und liefert die Angaben, die der Abschluss-Screen braucht.
import { NextResponse } from "next/server";
import { createInquiry, InvalidSelectionError } from "@/lib/inquiry/create";
import { InquiryPayloadSchema } from "@/lib/inquiry/schema";
import { clientIp } from "@/lib/http/client-ip";

// Einfaches Rate-Limit im Speicher: max. 10 Anfragen pro IP und 10 Minuten
// (siehe Aufgabenstellung). Bewusst ohne DB/Redis: Railway (CLAUDE.md
// Abschnitt "Architektur") läuft hier als ein einzelner Node-Prozess, ein
// Neustart oder mehrere Instanzen setzen den Zähler zurück - für "einfaches
// Rate-Limit" ausreichend, kein Schutz gegen verteilte Angriffe.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (requestLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(ip, recent);
  // Gelegentliches Aufräumen alter IPs, damit die Map bei Dauerbetrieb nicht
  // unbegrenzt wächst (nur wenn diese IP gerade ohnehin bearbeitet wird,
  // kein eigener Timer nötig).
  if (requestLog.size > 5000) {
    for (const [key, timestamps] of requestLog) {
      if (timestamps.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) requestLog.delete(key);
    }
  }
  return recent.length > RATE_LIMIT_MAX;
}

// clientIp() ist nach lib/http/client-ip.ts ausgelagert (Next.js Route
// Handler erlauben in dieser Datei nur HTTP-Methoden- und Konfig-Exports,
// siehe Prüfbefund; die IP-Ermittlung selbst inkl. Begründung Railway/
// x-forwarded-for steht dort).

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const parsed = InquiryPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }

  try {
    const result = await createInquiry(parsed.data, { source: "web", sendCustomerMail: true });
    return NextResponse.json({
      ok: true,
      id: result.id,
      number: result.number,
      shareToken: result.shareToken,
      estimatedTotal: result.estimatedTotal,
    });
  } catch (err) {
    if (err instanceof InvalidSelectionError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("POST /api/inquiries fehlgeschlagen.", err);
    return NextResponse.json(
      { ok: false, error: "Ihre Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut." },
      { status: 500 },
    );
  }
}
