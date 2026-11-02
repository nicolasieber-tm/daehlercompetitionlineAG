// Live-Vorschau der Mailtexte (lib/mail/preview.ts): nutzt die echte Logik,
// kennzeichnet Tool-Absätze und kommt ohne DB-Zugriff aus.
import { describe, expect, it } from "vitest";
import { PREVIEW_SCENARIO_IDS, previewConfirmation, previewDraft } from "@/lib/mail/preview";
import { DEFAULT_MAIL_TEXTS } from "@/lib/mail/texts";

const SIGNATURE = { name: "Christoph Dähler", company: "dÄHLer Competition Line AG", address: "Belp", phone: "+41 31 819 88 77" };

describe("previewDraft", () => {
  it("Ein Produkt: Anrede Herr, Empfehlungsform mit Achszeilen, Tool-Absätze markiert", () => {
    const { paragraphs } = previewDraft("single", "de", DEFAULT_MAIL_TEXTS.de, SIGNATURE);
    expect(paragraphs[0].text.startsWith("Guten Tag Herr Muster\n\n")).toBe(true);
    const items = paragraphs.find((p) => p.text.startsWith("Unsere Empfehlung: CDC2 FORGED"));
    expect(items?.generated).toBe(true);
    expect(items?.text).toContain("Vorderachse: 9 × 20 Zoll mit Bereifung 255/30 R20");
    expect(items?.text).toContain("Preis: ab CHF 7'300, inklusive Montage, exklusive MFK");
    expect(paragraphs.filter((p) => !p.generated).length).toBeGreaterThanOrEqual(6);
  });

  it("Mehrere Bereiche: Bereichsliste und Gesamtpreis", () => {
    const text = previewDraft("multi", "de", DEFAULT_MAIL_TEXTS.de, SIGNATURE).paragraphs.map((p) => p.text).join("\n\n");
    expect(text).toContain("Guten Tag Frau Beispiel");
    expect(text).toContain("Richtpreis für das Gesamtpaket: ab CHF 9'440");
  });

  it("Ohne Anrede: Vorname Name; englisch: Mr/Ms", () => {
    expect(previewDraft("noSalutation", "de", DEFAULT_MAIL_TEXTS.de, SIGNATURE).paragraphs[0].text).toContain("Guten Tag Max Muster");
    expect(previewDraft("single", "en", DEFAULT_MAIL_TEXTS.en, SIGNATURE).paragraphs[0].text).toContain("Dear Mr Muster");
  });

  it("geänderter Text wirkt sofort, leeres Feld fällt auf den Standard zurück", () => {
    const texts = { ...DEFAULT_MAIL_TEXTS.de, text_draft_timing: "Eigener Terminsatz.", text_draft_closing: "" };
    const text = previewDraft("single", "de", texts, SIGNATURE).paragraphs.map((p) => p.text).join("\n\n");
    expect(text).toContain("Eigener Terminsatz.");
    expect(text).toContain("Sportliche Grüsse aus Belp");
  });
});

describe("previewConfirmation", () => {
  it("alle Szenarien: Betreff, Mailtexte nicht markiert, Übersicht markiert, keine Gedankenstriche", () => {
    for (const id of PREVIEW_SCENARIO_IDS) {
      for (const locale of ["de", "en"] as const) {
        const { subject, paragraphs } = previewConfirmation(id, locale, DEFAULT_MAIL_TEXTS[locale]);
        expect(subject).toContain("2026-0912");
        expect(paragraphs[0].generated).toBe(false);
        expect(paragraphs.some((p) => p.generated)).toBe(true);
        expect(paragraphs.map((p) => p.text).join("\n")).not.toMatch(/[‒–—―]/);
      }
    }
  });
});
