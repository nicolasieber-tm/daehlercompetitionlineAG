import { describe, expect, it } from "vitest";
import { anredeText, fullNameWithSalutation, modellLabel, normalizeSalutation } from "@/lib/mail/anrede";
import { previewConfirmation } from "@/lib/mail/preview";
import { DEFAULT_MAIL_TEXTS, unknownMailTextPlaceholders } from "@/lib/mail/texts";

describe("anredeText", () => {
  it("mit Anrede: Herr/Frau plus Nachname, englisch Mr/Ms", () => {
    expect(anredeText("herr", "Christoph", "Dähler", "de")).toBe("Herr Dähler");
    expect(anredeText("frau", "Anna", "Muster", "de")).toBe("Frau Muster");
    expect(anredeText("herr", "Max", "Muster", "en")).toBe("Mr Muster");
    expect(anredeText("frau", "Anna", "Muster", "en")).toBe("Ms Muster");
  });

  it("ohne Anrede: Vorname Name, nie aus dem Vornamen abgeleitet", () => {
    expect(anredeText(null, "Christoph", "Dähler", "de")).toBe("Christoph Dähler");
    expect(anredeText(undefined, "Anna", "Muster", "de")).toBe("Anna Muster");
    expect(anredeText("unbekannt", "Anna", "Muster", "de")).toBe("Anna Muster");
    expect(anredeText(null, "", "Muster", "de")).toBe("Muster");
  });

  it("Admin-Anzeige mit Anrede und vollem Namen", () => {
    expect(fullNameWithSalutation("herr", "Christoph", "Dähler")).toBe("Herr Christoph Dähler");
    expect(fullNameWithSalutation(null, "Christoph", "Dähler")).toBe("Christoph Dähler");
    expect(normalizeSalutation("frau")).toBe("frau");
    expect(normalizeSalutation("x")).toBeNull();
  });
});

describe("modellLabel", () => {
  it("entfernt den Baureihencode in Klammern am Ende", () => {
    expect(modellLabel("BMW M2 (G87)")).toBe("BMW M2");
    expect(modellLabel("MINI Countryman One (Benzin, F60)")).toBe("MINI Countryman One");
    expect(modellLabel("Wiesmann")).toBe("Wiesmann");
    expect(modellLabel("(G87)")).toBe("(G87)");
  });
});

describe("Platzhalter {{anrede}} und {{modell}}", () => {
  it("sind bekannt, Tippfehler nicht", () => {
    expect(unknownMailTextPlaceholders("{{anrede}} {{modell}} {{fahrzeug}}")).toEqual([]);
    expect(unknownMailTextPlaceholders("{{anreden}}")).toEqual(["{{anreden}}"]);
  });

  it("Bestätigungsmail begrüsst mit Anrede, ohne Anrede mit Vorname Name", () => {
    const withSalutation = previewConfirmation("single", "de", DEFAULT_MAIL_TEXTS.de);
    expect(withSalutation.paragraphs[0].text).toBe("Guten Tag Herr Muster");
    const without = previewConfirmation("noSalutation", "de", DEFAULT_MAIL_TEXTS.de);
    expect(without.paragraphs[0].text).toBe("Guten Tag Max Muster");
  });
});
