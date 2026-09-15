// Feldnamen-Mapping im Schnellweg (components/admin/QuickInquiryForm.tsx,
// Prüfbefund admin-quick, Punkt 5): toInquiryPayload() (lib/ai/to-payload.ts)
// liefert in `missing` einen zod-Feldpfad je fehlendem/ungültigem Pflichtfeld
// (issue.path.join(".") - für dieses Schema immer ein einzelnes Segment,
// z.B. "familyId", "phone"). Die UI darf diese rohen Pfade nicht anzeigen,
// sondern muss sie über admin.quick.form.missingFieldLabels in eine
// deutsche Bezeichnung übersetzen (siehe missingFieldLabel() dort).
//
// Getestet wird hier direkt gegen InquiryPayloadObjectSchema (lib/inquiry/
// schema.ts) statt gegen eine hart codierte Feldliste, damit ein künftig
// neu hinzugefügtes Pflichtfeld im Schema automatisch auffällt, wenn dafür
// noch keine Bezeichnung nachgetragen wurde - kein Import von
// QuickInquiryForm.tsx nötig (eine "use client"-Komponente), die Mapping-
// Daten allein tragen bereits die volle Aussage.
import { describe, expect, it } from "vitest";
import { InquiryPayloadObjectSchema } from "@/lib/inquiry/schema";
import { admin } from "@/lib/i18n/admin";

const schemaFields = Object.keys(InquiryPayloadObjectSchema.shape);

describe("admin.quick.form.missingFieldLabels", () => {
  it("deckt jedes Feld aus InquiryPayloadObjectSchema ab", () => {
    for (const field of schemaFields) {
      expect(
        admin.quick.form.missingFieldLabels[field],
        `Feld "${field}" aus InquiryPayloadObjectSchema hat keine Bezeichnung in missingFieldLabels`,
      ).toBeDefined();
    }
  });

  it("jede Bezeichnung ist ein lesbarer Text, nicht identisch mit dem rohen Feldnamen", () => {
    for (const field of schemaFields) {
      const label = admin.quick.form.missingFieldLabels[field];
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(field);
    }
  });

  it("missingFieldFallback ist gesetzt (Fallback für ein unbekanntes Feld) und selbst kein roher Pfad", () => {
    const fallback = admin.quick.form.missingFieldFallback;
    expect(fallback.length).toBeGreaterThan(0);
    // Ein roher zod-Pfad ist ein einzelnes Wort ohne Leerzeichen (z.B.
    // "familyId"); der Fallback-Text ist ein Satzfragment mit Leerzeichen.
    expect(fallback).toMatch(/\s/);
  });

  it("Beispiel: 'familyId' und 'phone' werden nicht roh angezeigt", () => {
    expect(admin.quick.form.missingFieldLabels.familyId).toBe("Baureihe");
    expect(admin.quick.form.missingFieldLabels.phone).toBe("Telefon");
  });
});
