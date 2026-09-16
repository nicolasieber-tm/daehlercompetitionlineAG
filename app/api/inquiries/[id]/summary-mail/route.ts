// POST /api/inquiries/[id]/summary-mail: "Zusammenfassung an mich senden"
// im Abschluss-Screen (CLAUDE.md Kundenflow Schritt 6). Body { shareToken }
// muss zur Anfrage passen (sonst 404, kein Enumerieren fremder Anfragen
// über die id allein), max. 3 pro Anfrage (siehe Aufgabenstellung), gezählt
// über outbound_emails.
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db/client";
import { buildMailContext } from "@/lib/inquiry/context";
import { sendInquiryMail } from "@/lib/mail";

const bodySchema = z.object({
  shareToken: z.string().min(1, "shareToken ist ein Pflichtfeld."),
});

const MAX_SUMMARY_MAILS = 3;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ ok: false, error: "Ungültige Anfrage-ID." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültiger Request-Body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe." },
      { status: 400 },
    );
  }

  let inquiry: { id: string; share_token: string; email: string | null } | undefined;
  try {
    [inquiry] = await sql<{ id: string; share_token: string; email: string | null }[]>`
      select id, share_token, email from inquiries where id = ${id}
    `;
  } catch (err) {
    console.error(`POST /api/inquiries/${id}/summary-mail: Anfrage konnte nicht geladen werden.`, err);
    return NextResponse.json({ ok: false, error: "Anfrage konnte nicht geladen werden." }, { status: 500 });
  }
  // Absichtlich derselbe 404 sowohl für "id existiert nicht" als auch für
  // "shareToken passt nicht": eine unterschiedliche Antwort würde verraten,
  // ob eine id existiert.
  if (!inquiry || inquiry.share_token !== parsed.data.shareToken) {
    return NextResponse.json({ ok: false, error: "Anfrage nicht gefunden." }, { status: 404 });
  }
  if (!inquiry.email) {
    return NextResponse.json({ ok: false, error: "Anfrage hat keine E-Mail-Adresse." }, { status: 400 });
  }

  let count: number;
  try {
    const [row] = await sql<{ count: number }[]>`
      select count(*)::int as count from outbound_emails where inquiry_id = ${id} and type = 'summary'
    `;
    count = row.count;
  } catch (err) {
    console.error(`POST /api/inquiries/${id}/summary-mail: Zähler konnte nicht geladen werden.`, err);
    return NextResponse.json({ ok: false, error: "Zusammenfassung konnte nicht gesendet werden." }, { status: 500 });
  }
  if (count >= MAX_SUMMARY_MAILS) {
    return NextResponse.json(
      { ok: false, error: "Die Zusammenfassung wurde bereits mehrfach gesendet." },
      { status: 429 },
    );
  }

  try {
    const mailCtx = await buildMailContext(id);
    const result = await sendInquiryMail("summary", mailCtx);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Zusammenfassung konnte nicht gesendet werden." },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/inquiries/${id}/summary-mail fehlgeschlagen.`, err);
    return NextResponse.json({ ok: false, error: "Zusammenfassung konnte nicht gesendet werden." }, { status: 500 });
  }
}
