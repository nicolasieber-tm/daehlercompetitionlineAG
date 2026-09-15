// Foto-Validierung (app/api/admin/models/photo/route.ts, Prüfbefund
// admin-photo, Punkt 3): detectImageExtension()/isUuid() sind reine
// Funktionen in lib/admin/models.ts (nicht in der Route selbst - eine
// Next.js-Route-Handler-Datei soll ausser den HTTP-Methoden keine weiteren
// Exporte tragen), deshalb hier ohne HTTP-Server/DB testbar. Fixtures sind
// bewusst kurze Byte-Arrays (nur die Signatur + minimal Füllbytes), kein
// echtes Bild nötig.
import { describe, expect, it } from "vitest";
import { detectImageExtension, isUuid } from "@/lib/admin/models";

function bytes(...values: number[]): Buffer {
  return Buffer.from(values);
}

describe("detectImageExtension()", () => {
  it("erkennt JPEG an FF D8 FF", () => {
    expect(detectImageExtension(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe("jpg");
    // Die drei Signatur-Bytes allein reichen bereits.
    expect(detectImageExtension(bytes(0xff, 0xd8, 0xff))).toBe("jpg");
  });

  it("erkennt PNG an 89 50 4E 47", () => {
    expect(detectImageExtension(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(detectImageExtension(bytes(0x89, 0x50, 0x4e, 0x47))).toBe("png");
  });

  it("erkennt WebP am RIFF-Container mit WEBP-Kennung (Byte 8-11)", () => {
    // "RIFF" + 4 Bytes Chunk-Grösse (irrelevant für die Prüfung) + "WEBP"
    const riffWebp = Buffer.concat([Buffer.from("RIFF", "ascii"), bytes(0x00, 0x00, 0x00, 0x00), Buffer.from("WEBP", "ascii")]);
    expect(detectImageExtension(riffWebp)).toBe("webp");
  });

  it("lehnt eine zu kurze Datei ab (keine der drei Signaturen vollständig)", () => {
    expect(detectImageExtension(bytes(0xff, 0xd8))).toBeNull();
    expect(detectImageExtension(bytes())).toBeNull();
    expect(detectImageExtension(Buffer.from("RIFF", "ascii"))).toBeNull(); // "WEBP" fehlt noch
  });

  it("lehnt eine Datei mit vorgetäuschtem Bild-Typ ab (z.B. HTML/Text mit .jpg-Namen)", () => {
    expect(detectImageExtension(Buffer.from("<html><body>evil</body></html>", "ascii"))).toBeNull();
    expect(detectImageExtension(Buffer.from("%PDF-1.4", "ascii"))).toBeNull();
  });

  it("verwechselt die drei Formate nicht (RIFF ohne WEBP an Byte 8-11 ist kein WebP)", () => {
    // RIFF-Container, aber z.B. eine WAV-Datei ("WAVE" statt "WEBP")
    const riffWav = Buffer.concat([Buffer.from("RIFF", "ascii"), bytes(0x00, 0x00, 0x00, 0x00), Buffer.from("WAVE", "ascii")]);
    expect(detectImageExtension(riffWav)).toBeNull();
  });
});

describe("isUuid()", () => {
  it("akzeptiert eine gültige UUID (gross-/kleinschreibungsunabhängig)", () => {
    expect(isUuid("f3b1b8b0-6c3a-4e2a-9f0a-1234567890ab")).toBe(true);
    expect(isUuid("F3B1B8B0-6C3A-4E2A-9F0A-1234567890AB")).toBe(true);
  });

  it("lehnt Nicht-UUIDs ab", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("123")).toBe(false);
    expect(isUuid("f3b1b8b0-6c3a-4e2a-9f0a")).toBe(false); // zu kurz
    expect(isUuid("f3b1b8b06c3a4e2a9f0a1234567890ab")).toBe(false); // fehlende Bindestriche
    expect(isUuid("g3b1b8b0-6c3a-4e2a-9f0a-1234567890ab")).toBe(false); // ungültiges Zeichen "g"
  });
});
