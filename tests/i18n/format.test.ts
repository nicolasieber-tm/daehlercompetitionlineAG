import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chf, chfFrom, formatDate, inquiryNumberLabel } from "@/lib/i18n/format";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { tf } from "@/lib/i18n/dictionaries";

describe("chf", () => {
  it("formatiert mit Apostroph als Tausendertrennzeichen", () => {
    expect(chf(4180)).toBe("CHF 4'180");
  });

  it("formatiert Beträge unter 1000 ohne Trennzeichen", () => {
    expect(chf(840)).toBe("CHF 840");
  });

  it("formatiert 0 ohne Trennzeichen und ohne Vorzeichen", () => {
    expect(chf(0)).toBe("CHF 0");
  });

  it("formatiert sechsstellige Beträge mit zwei Trennzeichen", () => {
    expect(chf(1234567)).toBe("CHF 1'234'567");
  });

  it("rundet auf ganze Franken, keine Rappen", () => {
    expect(chf(4179.6)).toBe("CHF 4'180");
    expect(chf(4179.4)).toBe("CHF 4'179");
  });

  it("formatiert negative Beträge mit vorangestelltem Minus", () => {
    expect(chf(-500)).toBe("CHF -500");
    expect(chf(-4180)).toBe("CHF -4'180");
  });

  describe("ungültige Beträge (NaN, Infinity)", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("liefert für NaN einen leeren String und warnt", () => {
      expect(chf(NaN)).toBe("");
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it("liefert für Infinity einen leeren String und warnt", () => {
      expect(chf(Infinity)).toBe("");
      expect(chf(-Infinity)).toBe("");
      expect(warnSpy).toHaveBeenCalledTimes(2);
    });
  });
});

describe("chfFrom", () => {
  it("stellt 'ab' voran für Deutsch", () => {
    expect(chfFrom(4180, "de")).toBe("ab CHF 4'180");
  });

  it("stellt 'from' voran für Englisch", () => {
    expect(chfFrom(4180, "en")).toBe("from CHF 4'180");
  });
});

describe("formatDate", () => {
  it("formatiert deutsch-schweizerisch als TT.MM.JJJJ", () => {
    expect(formatDate(new Date(2026, 8, 12), "de")).toBe("12.09.2026");
  });

  it("formatiert britisches Englisch als DD/MM/YYYY", () => {
    expect(formatDate(new Date(2026, 8, 12), "en")).toBe("12/09/2026");
  });
});

describe("priceStatus.priced + chfFrom", () => {
  it("verdoppelt das 'ab'-Präfix nicht (de)", () => {
    const result = tf(de.priceStatus.priced, { price: chfFrom(4180, "de") });
    expect(result).toBe("ab CHF 4'180");
    expect(result).not.toMatch(/ab ab/);
  });

  it("verdoppelt das 'from'-Präfix nicht (en)", () => {
    const result = tf(en.priceStatus.priced, { price: chfFrom(4180, "en") });
    expect(result).toBe("from CHF 4'180");
    expect(result).not.toMatch(/from from/);
  });
});

describe("inquiryNumberLabel", () => {
  it("verwendet 'Nr.' für Deutsch", () => {
    expect(inquiryNumberLabel("2026-0912", "de")).toBe("Nr. 2026-0912");
  });

  it("verwendet 'No.' für Englisch", () => {
    expect(inquiryNumberLabel("2026-0912", "en")).toBe("No. 2026-0912");
  });
});
