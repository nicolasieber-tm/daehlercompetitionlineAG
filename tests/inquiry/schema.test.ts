// Reine Zod-Validierung (kein DB-Zugriff): Maximallängen der Kontaktfelder
// (Prüfung Phase B, Punkt 5: firstName/lastName/city 80, phone 40, email
// 120, vehicleText 200 - vehicleText hatte die Grenze bereits).
import { describe, expect, it } from "vitest";
import { InquiryPayloadSchema } from "@/lib/inquiry/schema";
import type { InquiryPayload } from "@/lib/inquiry/schema";

// Echte RFC4122-UUIDs (Version 4, Variante 8/9/a/b) - zod .uuid() prüft das
// Format strikt, ein Platzhalter wie "22222222-2222-2222-2222-222222222222"
// (Variantenstelle "2" statt 8/9/a/b) fällt sonst selbst durch.
const FAMILY_ID = "22222222-2222-4222-8222-222222222222";
const MODEL_ID = "33333333-3333-4333-8333-333333333333";

function basePayload(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    locale: "de",
    familyId: FAMILY_ID,
    modelId: MODEL_ID,
    vehicleText: null,
    year: "2024",
    beenHere: false,
    gearbox: null,
    categories: ["motor"],
    consulting: false,
    selections: [],
    followUpAnswers: {},
    character: "sportlich",
    timing: "flexible",
    firstName: "Nadia",
    lastName: "Muster",
    city: "Belp",
    phone: "079 000 00 00",
    email: "kunde@example.com",
    channel: "email",
    message: "",
    privacyAccepted: true,
    ...overrides,
  };
}

describe("InquiryPayloadSchema: Maximallängen", () => {
  it("akzeptiert ein gültiges Payload unverändert", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload());
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["firstName", 80],
    ["lastName", 80],
    ["city", 80],
  ] as const)("%s: bis 80 Zeichen gültig, 81 Zeichen ungültig", (field, max) => {
    const ok = InquiryPayloadSchema.safeParse(basePayload({ [field]: "A".repeat(max) }));
    expect(ok.success, `${field} mit ${max} Zeichen sollte gültig sein`).toBe(true);

    const tooLong = InquiryPayloadSchema.safeParse(basePayload({ [field]: "A".repeat(max + 1) }));
    expect(tooLong.success, `${field} mit ${max + 1} Zeichen sollte ungültig sein`).toBe(false);
  });

  it("phone: bis 40 Zeichen gültig, 41 Zeichen ungültig", () => {
    const ok = InquiryPayloadSchema.safeParse(basePayload({ phone: "0".repeat(40) }));
    expect(ok.success).toBe(true);
    const tooLong = InquiryPayloadSchema.safeParse(basePayload({ phone: "0".repeat(41) }));
    expect(tooLong.success).toBe(false);
  });

  it("email: bis 120 Zeichen gültig, 121 Zeichen (weiterhin gültige Adresse) ungültig", () => {
    // "a...a@example.com" auf exakt 120 bzw. 121 Zeichen auffüllen, dabei eine
    // gültige E-Mail-Form behalten (sonst schlägt schon .email() zuerst an).
    const domain = "@example.com";
    const okLocal = "a".repeat(120 - domain.length);
    const ok = InquiryPayloadSchema.safeParse(basePayload({ email: `${okLocal}${domain}` }));
    expect(ok.success).toBe(true);

    const tooLongLocal = "a".repeat(121 - domain.length);
    const tooLong = InquiryPayloadSchema.safeParse(basePayload({ email: `${tooLongLocal}${domain}` }));
    expect(tooLong.success).toBe(false);
  });

  it("vehicleText: bis 200 Zeichen gültig, 201 Zeichen ungültig", () => {
    const ok = InquiryPayloadSchema.safeParse(basePayload({ vehicleText: "A".repeat(200) }));
    expect(ok.success).toBe(true);
    const tooLong = InquiryPayloadSchema.safeParse(basePayload({ vehicleText: "A".repeat(201) }));
    expect(tooLong.success).toBe(false);
  });

  it("Typ-Check: ein erfolgreich geparstes Payload ist ein InquiryPayload", () => {
    const parsed = InquiryPayloadSchema.parse(basePayload());
    const typed: InquiryPayload = parsed;
    expect(typed.firstName).toBe("Nadia");
  });
});

// Rückmeldung zweiter Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 2):
// Ort ist kein Pflichtfeld mehr (viewContact()/canNext() in
// docs/vorschau.html verlangen ihn nie), Telefon nur bei Kanal
// "phone"/"whatsapp".
describe("InquiryPayloadSchema: Ort optional", () => {
  it("leerer Ort ist gültig und wird zu null", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ city: "" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.city).toBeNull();
  });

  it("fehlender Ort (Feld nicht im Payload) ist gültig und wird zu null", () => {
    const payload = basePayload({ city: undefined });
    const parsed = InquiryPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.city).toBeNull();
  });

  it("ein gesetzter Ort bleibt erhalten", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ city: "Belp" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.city).toBe("Belp");
  });
});

describe("InquiryPayloadSchema: Telefon nur bei Kanal phone/whatsapp Pflicht", () => {
  it.each(["phone", "whatsapp"] as const)("Kanal %s ohne Telefon ist ungültig", (channel) => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ channel, phone: "" }));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((i) => i.path.join(".") === "phone")).toBe(true);
    }
  });

  it.each(["phone", "whatsapp"] as const)("Kanal %s mit Telefon ist gültig", (channel) => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ channel, phone: "079 000 00 00" }));
    expect(parsed.success).toBe(true);
  });

  it("Kanal email ohne Telefon ist gültig, Telefon wird zu null", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ channel: "email", phone: "" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.phone).toBeNull();
  });
});

// Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
// Motorisierungen, das Modell ist X1 oder X2"): line ist optional, max 40
// Zeichen, leer/fehlend -> null (analog vehicleText/city).
// Entscheid 21.09.2026: bodyStyle/drive optional, fehlend -> null, nur
// bekannte Werte.
describe("InquiryPayloadSchema: bodyStyle und drive", () => {
  it("fehlende Felder werden zu null", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.bodyStyle).toBeNull();
      expect(parsed.data.drive).toBeNull();
    }
  });

  it("gültige Werte bleiben erhalten", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ bodyStyle: "touring", drive: "xdrive" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.bodyStyle).toBe("touring");
      expect(parsed.data.drive).toBe("xdrive");
    }
  });

  it("unbekannte Werte werden abgelehnt", () => {
    expect(InquiryPayloadSchema.safeParse(basePayload({ bodyStyle: "kombi" })).success).toBe(false);
    expect(InquiryPayloadSchema.safeParse(basePayload({ drive: "allrad" })).success).toBe(false);
  });
});

describe("InquiryPayloadSchema: line", () => {
  it("fehlendes line ist gültig und wird zu null", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ line: undefined }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.line).toBeNull();
  });

  it("null ist gültig", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ line: null }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.line).toBeNull();
  });

  it("leerer String wird zu null", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ line: "" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.line).toBeNull();
  });

  it("ein gesetzter Wert bleibt erhalten", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ line: "x2" }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.line).toBe("x2");
  });

  it("über 40 Zeichen ist ungültig", () => {
    const parsed = InquiryPayloadSchema.safeParse(basePayload({ line: "x".repeat(41) }));
    expect(parsed.success).toBe(false);
  });
});
