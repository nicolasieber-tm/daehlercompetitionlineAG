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
