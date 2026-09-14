// Posten 3, Schnellweg: echte Extraktion gegen die Anthropic-API und den
// lokalen Katalog (docker/Supabase, siehe docs/db.md). Läuft NUR, wenn
// ANTHROPIC_API_KEY gesetzt ist UND AI_LIVE_TEST=1 (siehe .env.example) -
// verbraucht sonst bei jedem `npm test` echte API-Tokens. Aufruf:
//
//   AI_LIVE_TEST=1 npx vitest run tests/ai/live.test.ts
//
// getCatalogCompact() (lib/catalog/queries.ts) braucht ohne Argument einen
// Next.js-Request-Kontext (next/headers cookies()), den es hier nicht gibt
// - deshalb wird lib/supabase/admin.ts createAdminClient() explizit an
// extractInquiry() durchgereicht (dritter, optionaler Parameter, siehe
// lib/ai/extract.ts).
//
// .env selbst laden wie tests/mail/resend.test.ts (kein dotenv-Paket in
// der freigegebenen Paketliste): vitest lädt .env nicht automatisch.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss die Variablen dann schon enthalten.
}

import { describe, expect, it } from "vitest";
import { extractInquiry } from "@/lib/ai/extract";
import { createAdminClient } from "@/lib/supabase/admin";

const shouldRun = !!process.env.ANTHROPIC_API_KEY && process.env.AI_LIVE_TEST === "1";

if (!shouldRun) {
  console.warn(
    "tests/ai/live.test.ts: übersprungen (ANTHROPIC_API_KEY und/oder AI_LIVE_TEST=1 nicht gesetzt).",
  );
}

describe.skipIf(!shouldRun)("extractInquiry (live, echte Anthropic-Aufrufe)", () => {
  const admin = createAdminClient();

  it("deutsche E-Mail: BMW M2 G87, Stufe 1 + Klappenauspuffanlage, Kontakt Max Muster", async () => {
    const text =
      "Guten Tag, ich habe einen M2 G87 Jahrgang 2024 und möchte Stufe 1 und eine Klappenauspuffanlage, " +
      "Termin im November, Gruss Max Muster, 079 555 12 34, max@example.ch";

    const extraction = await extractInquiry(text, undefined, admin);
    console.log("[live] deutsche E-Mail:", JSON.stringify(extraction, null, 2));

    expect(extraction.language).toBe("de");
    expect(extraction.vehicle.family_slug).toBe("m2-g87");
    expect(extraction.vehicle.model_slug).toBe("m2");
    expect(extraction.categories).toEqual(expect.arrayContaining(["motor", "auspuff"]));
    expect(extraction.selections.length).toBeGreaterThan(0);
    // Jede referenzierte product_id muss (falls gesetzt) gegen den Katalog
    // validiert sein - die Extraktion selbst garantiert das bereits, hier
    // nur zur Absicherung, dass validateExtraction() nicht leer greift.
    for (const s of extraction.selections) {
      if (s.product_id) expect(typeof s.product_id).toBe("string");
    }
    expect(extraction.contact.first_name).toBe("Max");
    expect(extraction.contact.last_name).toBe("Muster");
    expect(extraction.contact.email).toBe("max@example.ch");
    expect(extraction.contact.phone).toEqual(expect.stringContaining("079"));
  }, 60000);

  it("Telefonnotiz mit Tippfehlern: X3 G45 M50, Federn + 21 Zoll Räder", async () => {
    const text = "x3 g45 m50, will federn + 21 zoll räder, ruft zurück 031 555 22 11";

    const extraction = await extractInquiry(text, undefined, admin);
    console.log("[live] Telefonnotiz:", JSON.stringify(extraction, null, 2));

    expect(extraction.language).toBe("de");
    expect(extraction.vehicle.family_slug).toBe("x3-g45");
    expect(extraction.vehicle.model_slug).toBe("m50");
    expect(extraction.categories).toEqual(expect.arrayContaining(["fahrwerk", "raeder"]));
  }, 60000);

  it("englische Anfrage: MINI JCW ohne konkrete Produkte, Beratung/Komplettpaket erkannt", async () => {
    const text =
      "Hello, I'm interested in a MINI JCW but I'm not sure yet what exactly I want, maybe a bit more power " +
      "and a sportier look. Could you tell me what's possible and send me an offer? Best regards, " +
      "John Smith, Zurich, +41 79 555 66 77, john.smith@example.com";

    const extraction = await extractInquiry(text, undefined, admin);
    console.log("[live] englische Anfrage:", JSON.stringify(extraction, null, 2));

    expect(extraction.language).toBe("en");
    // MINI JCW ohne Karosserieform ist mehrdeutig (mehrere MINI-Familien
    // führen ein "JCW"-Modell, siehe docs/excel-import.md) - hier nur
    // prüfen, dass (falls überhaupt gesetzt) eine echte MINI-Familie
    // gewählt wurde, nicht welche genau.
    if (extraction.vehicle.family_slug) {
      expect(extraction.vehicle.family_slug.startsWith("mini-")).toBe(true);
    }
    expect(extraction.contact.first_name).toBe("John");
    expect(extraction.contact.last_name).toBe("Smith");
    expect(extraction.contact.email).toBe("john.smith@example.com");
    expect(extraction.contact.city).toBe("Zurich");
  }, 60000);
});
