// Reine Unit-Tests, keine DB (siehe lib/followups/placeholders.ts).
import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/lib/followups/placeholders";

describe("renderTemplate", () => {
  it("ersetzt alle vier bekannten Platzhalter", () => {
    const result = renderTemplate("Guten Tag {{vorname}} {{name}}, Ihr {{fahrzeug}}, Nr. {{nummer}}.", {
      vorname: "Nadia",
      name: "Muster",
      fahrzeug: "BMW M3 Touring G81",
      nummer: "2026-0912",
    });

    expect(result.text).toBe("Guten Tag Nadia Muster, Ihr BMW M3 Touring G81, Nr. 2026-0912.");
    expect(result.unknownPlaceholders).toEqual([]);
  });

  it("lässt bekannte Platzhalter ohne übergebenen Wert unverändert stehen, keine Warnung", () => {
    const result = renderTemplate("Hallo {{vorname}}, {{unbekannt}} bleibt stehen.", { vorname: "Nadia" });

    expect(result.text).toBe("Hallo Nadia, {{unbekannt}} bleibt stehen.");
    expect(result.unknownPlaceholders).toEqual(["{{unbekannt}}"]);
  });

  it("meldet unbekannte Platzhalter einmal je Vorkommen, ohne Duplikate", () => {
    const result = renderTemplate("{{modell}} und nochmal {{modell}}, ausserdem {{jahr}}.", {});

    expect(result.text).toBe("{{modell}} und nochmal {{modell}}, ausserdem {{jahr}}.");
    expect(result.unknownPlaceholders).toEqual(["{{modell}}", "{{jahr}}"]);
  });

  it("Text ohne Platzhalter bleibt unverändert, keine Warnungen", () => {
    const result = renderTemplate("Ein Text ganz ohne Platzhalter.", {});

    expect(result.text).toBe("Ein Text ganz ohne Platzhalter.");
    expect(result.unknownPlaceholders).toEqual([]);
  });
});
