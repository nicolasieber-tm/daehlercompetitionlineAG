// POST/DELETE /api/admin/models/photo: Baureihen-Foto hochladen/ersetzen
// (POST, multipart/form-data mit "familyId" + "file") bzw. entfernen
// (DELETE, JSON-Body { familyId }). Siehe docs/umbau-railway.md, Abschnitt
// "Fotos und Import-Zwischenspeicher": Fotos liegen als bytea in der Tabelle
// `photos`, ausgeliefert über GET /api/photos/[id] (Content-Type,
// ETag=sha1). Serverseitig max. 8 MB,
// jpg/png/webp, photo_url zeigt danach auf /api/photos/<id>,
// revalidateTag('catalog'). Nur für angemeldete Admins, sonst 401
// (middleware.ts deckt /api/admin/* bereits über das Session-Cookie ab,
// getAdminUser() hier als zweite, unabhängige Prüfung mit echtem
// DB-Zugriff, wie bei jeder anderen Admin-Route).
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getAdminUser } from "@/lib/admin/auth";
import { detectImageExtension, getFamilyForPhoto, isUuid } from "@/lib/admin/models";
import { sql } from "@/lib/db/client";

const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const user = await getAdminUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültige Anfrage (kein multipart/form-data)." }, { status: 400 });
  }

  const familyId = formData.get("familyId");
  const file = formData.get("file");
  if (typeof familyId !== "string" || !familyId || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "familyId und file sind erforderlich." }, { status: 400 });
  }
  if (!isUuid(familyId)) {
    return NextResponse.json({ ok: false, error: "familyId ist keine gültige UUID." }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ ok: false, error: "Bitte JPG, PNG oder WebP wählen." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ ok: false, error: "Datei ist grösser als 8 MB." }, { status: 400 });
  }

  // Inhalt einmal lesen: für die Magic-Bytes-Prüfung UND (bei Erfolg) für
  // den Insert weiter unten - kein zweites file.arrayBuffer().
  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedExt = detectImageExtension(buffer);
  if (!detectedExt || detectedExt !== ext) {
    return NextResponse.json(
      { ok: false, error: "Datei ist kein gültiges JPG-, PNG- oder WebP-Bild (Inhalt passt nicht zum angegebenen Typ)." },
      { status: 400 },
    );
  }

  const family = await getFamilyForPhoto(familyId);
  if (!family) {
    return NextResponse.json({ ok: false, error: "Baureihe nicht gefunden." }, { status: 404 });
  }

  try {
    const sha1 = createHash("sha1").update(buffer).digest("hex");

    const photoUrl = await sql.begin(async (tx) => {
      const [photo] = await tx<{ id: string }[]>`
        insert into photos (kind, owner_id, content_type, bytes, size, sha1)
        values ('family', ${familyId}, ${file.type}, ${buffer}, ${buffer.length}, ${sha1})
        returning id
      `;
      // Voriges Foto derselben Familie entfernen (siehe Aufgabenstellung
      // "löscht das vorherige Foto der Familie/des Modells") - erst nach dem
      // erfolgreichen Insert, damit bei einem Fehler weiter oben nie
      // versehentlich ein noch gültiges Foto verloren geht.
      await tx`delete from photos where kind = 'family' and owner_id = ${familyId} and id != ${photo.id}`;
      const url = `/api/photos/${photo.id}`;
      await tx`update model_families set photo_url = ${url} where id = ${familyId}`;
      return url;
    });

    revalidateTag("catalog");
    revalidatePath(`/admin/modelle/${family.slug}`);
    revalidatePath("/admin/modelle");

    return NextResponse.json({ ok: true, photoUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Foto-Upload fehlgeschlagen.";
    console.error("POST /api/admin/models/photo fehlgeschlagen.", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

const deleteSchema = z.object({
  familyId: z.string().refine(isUuid, { message: "familyId ist keine gültige UUID." }),
});

export async function DELETE(request: Request) {
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
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "familyId ist erforderlich." },
      { status: 400 },
    );
  }

  const family = await getFamilyForPhoto(parsed.data.familyId);
  if (!family) {
    return NextResponse.json({ ok: false, error: "Baureihe nicht gefunden." }, { status: 404 });
  }

  try {
    // Löschen der photos-Zeile(n) und das Zurücksetzen von photo_url in
    // derselben Transaktion, damit photo_url nie auf ein bereits gelöschtes
    // Foto zeigen kann.
    await sql.begin(async (tx) => {
      await tx`delete from photos where kind = 'family' and owner_id = ${family.id}`;
      await tx`update model_families set photo_url = null where id = ${family.id}`;
    });

    revalidateTag("catalog");
    revalidatePath(`/admin/modelle/${family.slug}`);
    revalidatePath("/admin/modelle");

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Foto entfernen fehlgeschlagen.";
    console.error("DELETE /api/admin/models/photo fehlgeschlagen.", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
