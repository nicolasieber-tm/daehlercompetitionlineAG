// GET /api/photos/[id]: liefert ein in der Tabelle `photos` gespeichertes
// Foto aus (bytea, siehe docs/umbau-railway.md, Abschnitt "Fotos und
// Import-Zwischenspeicher"). Kein Login nötig: photo_url zeigt öffentlich
// auf diese Route. ETag = sha1 (inhaltsadressiert, ändert
// sich nur, wenn sich der Bildinhalt ändert), Cache-Control
// "public, max-age=31536000, immutable" (ein Jahr, wie ein Datei-Asset unter
// /img/models/...) - ein Foto-Wechsel bekommt ohnehin eine neue id (siehe
// app/api/admin/models/photo/route.ts: Insert statt Update), die alte URL
// wird gelöscht statt überschrieben, ein langes Cache-Alter ist daher
// unproblematisch.
import { NextResponse } from "next/server";
import { isUuid } from "@/lib/admin/models";
import { sql } from "@/lib/db/client";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ ok: false, error: "Ungültige Foto-ID." }, { status: 404 });
  }

  const [photo] = await sql<{ content_type: string; bytes: Buffer; sha1: string }[]>`
    select content_type, bytes, sha1 from photos where id = ${id}
  `;
  if (!photo) {
    return NextResponse.json({ ok: false, error: "Foto nicht gefunden." }, { status: 404 });
  }

  const etag = `"${photo.sha1}"`;
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  return new NextResponse(new Uint8Array(photo.bytes), {
    status: 200,
    headers: {
      "Content-Type": photo.content_type,
      "Content-Length": String(photo.bytes.length),
      ETag: etag,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
