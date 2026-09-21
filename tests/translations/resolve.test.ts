// Reine Auflösung übersetzter Produkttexte (Posten 4), lib/translations/resolve.ts.
import { describe, expect, it } from "vitest";
import {
  hasTranslation,
  normalizeSourceText,
  parseStoredTranslations,
  pickTranslations,
  translateText,
} from "@/lib/translations/resolve";

describe("normalizeSourceText", () => {
  it("fasst Leerzeichen/NBSP zusammen, trimmt je Zeile, entfernt Leerzeilen, behält Zeilenumbrüche", () => {
    expect(normalizeSourceText("  Heckflügel Carbon  ")).toBe("Heckflügel Carbon");
    expect(normalizeSourceText('10 x 20"  mit 275/30 20\r\n\n 10 x 20" mit 285/30 20 ')).toBe(
      '10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20',
    );
    expect(normalizeSourceText("   ")).toBe("");
  });
});

describe("translateText", () => {
  const map = { "Heckflügel Carbon": "Rear wing carbon" };

  it("liefert die Übersetzung über den normalisierten Schlüssel", () => {
    expect(translateText("Heckflügel  Carbon", map)).toBe("Rear wing carbon");
    expect(hasTranslation("Heckflügel Carbon", map)).toBe(true);
  });

  it("fällt auf den deutschen Text zurück, wenn keine Übersetzung bekannt ist oder keine Map da ist", () => {
    expect(translateText("Frontgrill Carbon", map)).toBe("Frontgrill Carbon");
    expect(translateText("Heckflügel Carbon", null)).toBe("Heckflügel Carbon");
    expect(translateText("Heckflügel Carbon", undefined)).toBe("Heckflügel Carbon");
    expect(translateText(null, map)).toBeNull();
    expect(translateText("", map)).toBe("");
    expect(hasTranslation("Frontgrill Carbon", map)).toBe(false);
  });

  it("ignoriert leere Übersetzungen", () => {
    expect(translateText("Heckflügel Carbon", { "Heckflügel Carbon": "   " })).toBe("Heckflügel Carbon");
  });
});

describe("pickTranslations / parseStoredTranslations", () => {
  it("behält nur Einträge der genannten Quelltexte", () => {
    const map = { A: "a", B: "b", C: "c" };
    expect(pickTranslations(map, ["A", " C "])).toEqual({ A: "a", C: "c" });
  });

  it("liest inquiries.translations für die Sprache, null bei Deutsch/fremder Struktur", () => {
    const raw = { en: { "Heckflügel Carbon": "Rear wing carbon", leer: "  " } };
    expect(parseStoredTranslations(raw, "en")).toEqual({ "Heckflügel Carbon": "Rear wing carbon" });
    expect(parseStoredTranslations(raw, "de")).toBeNull();
    expect(parseStoredTranslations(null, "en")).toBeNull();
    expect(parseStoredTranslations([], "en")).toBeNull();
    expect(parseStoredTranslations({ en: {} }, "en")).toBeNull();
  });
});
