// POST/DELETE /api/admin/models/photo: Baureihen-Foto hochladen/ersetzen
// (POST, multipart/form-data mit "familyId" + "file") bzw. entfernen
// (DELETE, JSON-Body { familyId }). Siehe Aufgabenstellung "Modelle": Foto
// hochladen/ersetzen/entfernen, Storage-Bucket model-photos über
// Service-Role, Pfad families/<slug>.<ext>, serverseitig max. 8 MB,
// jpg/png/webp, photo_url speichern, revalidateTag('catalog'). Nur für
// angemeldete Admins (Supabase-Session), sonst 401.
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { detectImageExtension, getFamilyForPhoto, isUuid, setFamilyPhotoUrl } from "@/lib/admin/models";

const BUCKET = "model-photos";
const MAX_SIZE = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Alle möglichen bisherigen Dateiendungen: vor einem Upload/Entfernen werden
// sämtliche Kandidaten gelöscht, damit bei einem Wechsel des Dateityps
// (z.B. vorher .png, jetzt .jpg) kein verwaistes altes Objekt im Bucket
// liegen bleibt (der Pfad ist sonst nur über slug+ext eindeutig).
const ALL_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

function pathsForSlug(slug: string): string[] {
  return ALL_EXTENSIONS.map((ext) => `families/${slug}.${ext}`);
}

async function requireSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await requireSessionUser();
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
  // den Upload weiter unten - kein zweites file.arrayBuffer().
  const buffer = Buffer.from(await file.arrayBuffer());
  const detectedExt = detectImageExtension(buffer);
  if (!detectedExt || detectedExt !== ext) {
    return NextResponse.json(
      { ok: false, error: "Datei ist kein gültiges JPG-, PNG- oder WebP-Bild (Inhalt passt nicht zum angegebenen Typ)." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const family = await getFamilyForPhoto(familyId, admin);
  if (!family) {
    return NextResponse.json({ ok: false, error: "Baureihe nicht gefunden." }, { status: 404 });
  }

  try {
    // Alte Objekte aller Endungen zuerst entfernen (siehe Kommentar oben),
    // Fehler dabei sind unkritisch (z.B. Objekt existierte gar nicht).
    await admin.storage.from(BUCKET).remove(pathsForSlug(family.slug));

    const path = `families/${family.slug}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { data: publicUrlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    await setFamilyPhotoUrl(familyId, publicUrlData.publicUrl, admin);

    revalidateTag("catalog");
    revalidatePath(`/admin/modelle/${family.slug}`);
    revalidatePath("/admin/modelle");

    return NextResponse.json({ ok: true, photoUrl: publicUrlData.publicUrl });
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
  const user = await requireSessionUser();
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

  const admin = createAdminClient();
  const family = await getFamilyForPhoto(parsed.data.familyId, admin);
  if (!family) {
    return NextResponse.json({ ok: false, error: "Baureihe nicht gefunden." }, { status: 404 });
  }

  try {
    await admin.storage.from(BUCKET).remove(pathsForSlug(family.slug));
    await setFamilyPhotoUrl(family.id, null, admin);

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
