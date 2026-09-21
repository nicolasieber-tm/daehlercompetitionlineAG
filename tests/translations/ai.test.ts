// Nachprüfung und Tool-Antwort der automatischen Übersetzung (Posten 4),
// lib/translations/ai.ts - ohne API-Aufruf.
import { describe, expect, it } from "vitest";
import { parseToolResult, validateTranslation } from "@/lib/translations/ai";

describe("validateTranslation", () => {
  it("akzeptiert eine Übersetzung mit allen Zahlen und gleicher Zeilenzahl", () => {
    expect(validateTranslation("Distanzscheibe 3mm schwarz eloxiert (2 Stk.)", "Wheel spacer 3mm black anodised (2 pcs.)")).toBeNull();
    expect(
      validateTranslation('10 x 20" mit 275/30 20\n10 x 20" mit 285/30 20', '10 x 20" with 275/30 20\n10 x 20" with 285/30 20'),
    ).toBeNull();
  });

  it("verwirft fehlende oder veränderte Zahlen", () => {
    expect(validateTranslation("Sportfedernsatz VA -20mm / HA -14mm", "Sport spring kit front -20mm")).toBe("Zahl 14 fehlt");
    expect(validateTranslation("Endrohre 100mm", "Tailpipes 4 inch")).toBe("Zahl 100 fehlt");
  });

  it("verwirft leere Texte, abweichende Zeilenzahl, Gedankenstriche und fehlendes dÄHLer", () => {
    expect(validateTranslation("Heckflügel Carbon", "  ")).toBe("leer");
    expect(validateTranslation("a\nb", "a b")).toBe("Zeilenanzahl 1 statt 2");
    expect(validateTranslation("Heckflügel Carbon", "Rear wing – carbon")).toBe("enthält einen Gedankenstrich");
    expect(validateTranslation("dÄHLer Emblem mit Träger 72mm", "Daehler badge with carrier 72mm")).toBe("Markenname dÄHLer fehlt");
    expect(validateTranslation("dÄHLer Emblem mit Träger 72mm", "dÄHLer badge with carrier 72mm")).toBeNull();
  });

  it("erlaubt ein anderes Tausendertrennzeichen, solange die Ziffernfolgen erhalten bleiben", () => {
    expect(validateTranslation("Richtpreis CHF 1'240", "Indicative price CHF 1,240")).toBeNull();
  });
});

describe("parseToolResult", () => {
  const sources = ["Heckflügel Carbon", "Endrohre 100mm", "Spiegelkappen links/rechts Carbon"];

  it("ordnet nach id zu, prüft nach und meldet fehlende/verworfene Texte", () => {
    const result = parseToolResult(
      {
        translations: [
          { id: 0, text: "Rear wing carbon" },
          { id: 1, text: "Tailpipes 4 inch" },
          { id: 5, text: "unbekannte id" },
        ],
      },
      sources,
      "claude-sonnet-5",
    );
    expect([...result.translations]).toEqual([["Heckflügel Carbon", "Rear wing carbon"]]);
    expect(result.rejected.get("Endrohre 100mm")).toBe("Zahl 100 fehlt");
    expect(result.rejected.get("Spiegelkappen links/rechts Carbon")).toBe("keine Übersetzung geliefert");
    expect(result.model).toBe("claude-sonnet-5");
  });

  it("normalisiert Leerzeichen in der gelieferten Übersetzung", () => {
    const result = parseToolResult({ translations: [{ id: 0, text: "  Rear  wing carbon " }] }, ["Heckflügel Carbon"], "m");
    expect(result.translations.get("Heckflügel Carbon")).toBe("Rear wing carbon");
  });

  it("verkraftet eine fremde Struktur (alles fehlend)", () => {
    const result = parseToolResult({ nope: 1 }, ["A"], "m");
    expect(result.translations.size).toBe(0);
    expect(result.rejected.get("A")).toBe("keine Übersetzung geliefert");
  });
});
