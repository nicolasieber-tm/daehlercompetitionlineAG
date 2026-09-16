// Fotos in Postgres (Tabelle `photos`, siehe docs/umbau-railway.md,
// Abschnitt "Fotos und Import-Zwischenspeicher"): GET /api/photos/[id] liefert Bytes mit
// Content-Type und ETag=sha1 aus, 304 bei passendem If-None-Match, 404
// sonst. Der Upload-Weg selbst (app/api/admin/models/photo/route.ts POST)
// ruft revalidateTag()/revalidatePath() auf, die ausserhalb eines laufenden
// Next.js-Requests werfen (siehe lib/mail/settings.ts-Kommentar zum
// selben next/cache-Verhalten) - der volle Upload-Weg wird darum als
// Playwright-E2E gegen den echten Dev-Server geprüft (siehe AUFGABE), hier
// die Datenebene direkt: eine Zeile wie sie POST anlegen würde, plus die
// GET-Route.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "../helpers/db";
import { GET } from "@/app/api/photos/[id]/route";
import { getFamilyForPhoto, setFamilyPhotoUrl } from "@/lib/admin/models";

// Kleines, aber gültiges JPEG-Fixture (Signatur FF D8 FF, siehe
// tests/admin/photo-validation.test.ts) - der Bildinhalt selbst ist für
// diesen Test irrelevant, nur Bytes/ETag/Content-Type zählen.
const JPEG_FIXTURE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

const insertedPhotoIds: string[] = [];

async function insertPhoto(bytes: Buffer, contentType = "image/jpeg"): Promise<{ id: string; sha1: string }> {
  const sha1 = createHash("sha1").update(bytes).digest("hex");
  const [row] = await sql<{ id: string }[]>`
    insert into photos (kind, owner_id, content_type, bytes, size, sha1)
    values ('family', ${randomUUID()}, ${contentType}, ${bytes}, ${bytes.length}, ${sha1})
    returning id
  `;
  insertedPhotoIds.push(row.id);
  return { id: row.id, sha1 };
}

afterAll(async () => {
  if (insertedPhotoIds.length > 0) {
    await sql`delete from photos where id in ${sql(insertedPhotoIds)}`;
  }
});

describe("GET /api/photos/[id]", () => {
  it("liefert die Bytes mit Content-Type, ETag und langem Cache-Control", async () => {
    const { id, sha1 } = await insertPhoto(JPEG_FIXTURE);

    const response = await GET(new Request(`http://localhost/api/photos/${id}`), {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("etag")).toBe(`"${sha1}"`);
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.equals(JPEG_FIXTURE)).toBe(true);
  });

  it("liefert 304 bei passendem If-None-Match, ohne Body", async () => {
    const { id, sha1 } = await insertPhoto(JPEG_FIXTURE);

    const response = await GET(
      new Request(`http://localhost/api/photos/${id}`, { headers: { "if-none-match": `"${sha1}"` } }),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(`"${sha1}"`);
    const body = await response.arrayBuffer();
    expect(body.byteLength).toBe(0);
  });

  it("liefert 200 bei nicht passendem If-None-Match", async () => {
    const { id } = await insertPhoto(JPEG_FIXTURE);

    const response = await GET(
      new Request(`http://localhost/api/photos/${id}`, { headers: { "if-none-match": '"veraltet"' } }),
      { params: Promise.resolve({ id }) },
    );

    expect(response.status).toBe(200);
  });

  it("liefert 404 für eine unbekannte, aber gültige UUID", async () => {
    const response = await GET(new Request("http://localhost/api/photos/00000000-0000-0000-0000-000000000000"), {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(response.status).toBe(404);
  });

  it("liefert 404 für eine ungültige id, ohne die DB zu befragen", async () => {
    const response = await GET(new Request("http://localhost/api/photos/nicht-uuid"), {
      params: Promise.resolve({ id: "nicht-uuid" }),
    });
    expect(response.status).toBe(404);
  });
});

describe("getFamilyForPhoto()/setFamilyPhotoUrl()", () => {
  it("liest und schreibt photo_url einer Baureihe (Platzhalter-Familie, kein bleibender Unterschied)", async () => {
    const [wiesmann] = await sql<{ id: string; photo_url: string | null }[]>`
      select id, photo_url from model_families where slug = 'wiesmann'
    `;
    if (!wiesmann) throw new Error('Platzhalter-Baureihe "wiesmann" fehlt (db/seed.sql, npm run db:seed).');

    const before = await getFamilyForPhoto(wiesmann.id);
    expect(before?.slug).toBe("wiesmann");

    await setFamilyPhotoUrl(wiesmann.id, "/api/photos/test-platzhalter");
    const after = await getFamilyForPhoto(wiesmann.id);
    expect(after?.photoUrl).toBe("/api/photos/test-platzhalter");

    await setFamilyPhotoUrl(wiesmann.id, wiesmann.photo_url);
    const restored = await getFamilyForPhoto(wiesmann.id);
    expect(restored?.photoUrl).toBe(wiesmann.photo_url);
  });

  it("liefert null für eine unbekannte Baureihen-id", async () => {
    const result = await getFamilyForPhoto("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});
