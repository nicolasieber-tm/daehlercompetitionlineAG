import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import { tf } from "@/lib/i18n/dictionaries";
import { chf } from "@/lib/i18n/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => collectKeyPaths(item, `${prefix}[${i}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value as AnyRecord).flatMap(([key, v]) =>
      collectKeyPaths(v, prefix ? `${prefix}.${key}` : key),
    );
  }
  // Blatt-Wert: Pfad selbst ist der relevante Eintrag.
  return [prefix];
}

function collectPlaceholders(value: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  function walk(v: unknown, prefix: string) {
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${prefix}[${i}]`));
      return;
    }
    if (v !== null && typeof v === "object") {
      Object.entries(v as AnyRecord).forEach(([key, val]) => walk(val, prefix ? `${prefix}.${key}` : key));
      return;
    }
    if (typeof v === "string") {
      const matches = [...v.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      if (matches.length) result[prefix] = matches;
    }
  }
  walk(value, "");
  return result;
}

describe("de/en Dictionary-Struktur", () => {
  it("haben rekursiv dieselben Schlüssel", () => {
    const deKeys = collectKeyPaths(de).sort();
    const enKeys = collectKeyPaths(en).sort();
    expect(enKeys).toEqual(deKeys);
  });

  it("verwenden an denselben Stellen dieselben Platzhalter", () => {
    const dePlaceholders = collectPlaceholders(de);
    const enPlaceholders = collectPlaceholders(en);
    expect(Object.keys(enPlaceholders).sort()).toEqual(Object.keys(dePlaceholders).sort());
    for (const key of Object.keys(dePlaceholders)) {
      expect(enPlaceholders[key], `Platzhalter bei ${key}`).toEqual(dePlaceholders[key]);
    }
  });
});

const deSource = readFileSync(path.resolve(__dirname, "../../lib/i18n/de.ts"), "utf-8");
const enSource = readFileSync(path.resolve(__dirname, "../../lib/i18n/en.ts"), "utf-8");

describe("Sie-Form in de.ts", () => {
  it("enthält kein eigenständiges 'du', 'dein' oder 'dir'", () => {
    // Wortgrenzen, case-insensitiv, damit "Dudelsack" o.ä. nicht anschlägt
    // (kommt hier zwar nicht vor, aber die Regel soll robust sein).
    const forbidden = /\b(du|dein|deine|deinen|deinem|deiner|deines|dir)\b/gi;
    const matches = [...deSource.matchAll(forbidden)].map((m) => m[0]);
    expect(matches).toEqual([]);
  });
});

describe("Keine Gedankenstriche in Kundentexten", () => {
  it("de.ts enthält kein U+2013 (–) oder U+2014 (—)", () => {
    expect(/[–—]/.test(deSource)).toBe(false);
  });

  it("en.ts enthält kein U+2013 (–) oder U+2014 (—)", () => {
    expect(/[–—]/.test(enSource)).toBe(false);
  });
});

// Sprachneutrale IDs (docs/architektur.md: "Auswahlwerte sind sprachneutrale
// IDs; Dictionaries liefern { id, label }-Optionen"): steps.timing.options,
// contact.channels, character.options, category.followUp.*.options sind
// Arrays von Objekten mit einem string-Feld "id". Diese Prüfung findet sie
// generisch, ohne jeden Pfad einzeln aufzuzählen, damit eine neue
// ID-Options-Gruppe automatisch mitgeprüft wird.
type IdOption = { id: string } & AnyRecord;

function isIdOptionArray(value: unknown): value is IdOption[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) => item !== null && typeof item === "object" && typeof (item as AnyRecord).id === "string",
    )
  );
}

/** Findet alle Arrays von { id, ... }-Optionen und liefert Pfad -> ids (in Reihenfolge). */
function collectIdGroups(value: unknown, prefix = ""): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  function walk(v: unknown, path: string) {
    if (isIdOptionArray(v)) {
      result[path] = v.map((o) => o.id);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (v !== null && typeof v === "object") {
      Object.entries(v as AnyRecord).forEach(([key, val]) => walk(val, path ? `${path}.${key}` : key));
    }
  }
  walk(value, prefix);
  return result;
}

describe("Sprachneutrale IDs bei Auswahlwerten", () => {
  const deGroups = collectIdGroups(de);
  const enGroups = collectIdGroups(en);

  it("findet die bekannten ID-Options-Gruppen", () => {
    expect(Object.keys(deGroups).sort()).toEqual(
      [
        "steps.category.followUp.auspuff.options",
        "steps.category.followUp.fahrwerk.options",
        "steps.category.followUp.motor.options",
        "steps.category.followUp.raeder.options",
        "steps.character.options",
        "steps.contact.channels",
        "steps.timing.options",
      ].sort(),
    );
  });

  it("jede Option hat eine nicht leere id", () => {
    for (const [group, ids] of Object.entries(deGroups)) {
      for (const id of ids) {
        expect(id.length, `id in ${group}`).toBeGreaterThan(0);
      }
    }
  });

  it("ids sind je Gruppe eindeutig", () => {
    for (const [group, ids] of Object.entries(deGroups)) {
      expect(new Set(ids).size, `Duplikate in ${group}: ${ids.join(", ")}`).toBe(ids.length);
    }
  });

  it("de und en verwenden dieselben ids in derselben Reihenfolge", () => {
    expect(Object.keys(enGroups).sort()).toEqual(Object.keys(deGroups).sort());
    for (const group of Object.keys(deGroups)) {
      expect(enGroups[group], group).toEqual(deGroups[group]);
    }
  });

  it("stimmen mit den in docs/architektur.md festgelegten IDs überein", () => {
    expect(deGroups["steps.timing.options"]).toEqual(["asap", "m1_2", "m3_6", "flexible"]);
    expect(deGroups["steps.contact.channels"]).toEqual(["phone", "email", "whatsapp"]);
    expect(deGroups["steps.character.options"]).toEqual(["dezent", "sportlich", "maximum"]);
    expect(deGroups["steps.category.followUp.motor.options"]).toEqual(["leistung", "sound", "beides"]);
    expect(deGroups["steps.category.followUp.auspuff.options"]).toEqual([
      "dezent",
      "kraeftig",
      "rennstrecke",
    ]);
    expect(deGroups["steps.category.followUp.fahrwerk.options"]).toEqual(["alltag", "pass", "track"]);
    expect(deGroups["steps.category.followUp.raeder.options"]).toEqual([
      "schwarz",
      "silber",
      "wunschfarbe",
    ]);
  });
});

// draft.priceLine: {clarification} ist bereits ein vollständiger Nebensatz
// (docs/architektur.md, Befund "priceLine"), die drei Varianten müssen zu
// grammatisch vollständigen Sätzen zusammengebaut werden. Der Test baut die
// Zusammensetzung nach, wie sie lib/draft/template.ts später vornehmen wird
// (tf() mit price + clarification).
describe("draft.priceLine: Satzbau mit clarification", () => {
  it("baut alle drei deutschen Varianten zu vollständigen Sätzen zusammen", () => {
    const price = "ab CHF 4'180";

    expect(tf(de.draft.priceLine, { price, clarification: de.draft.clarificationFahrwerk })).toBe(
      "Richtpreis für das Paket: ab CHF 4'180, inklusive Einbau, ohne MFK. Den definitiven Preis bestätigen wir Ihnen, sobald wir wissen, ob Ihr Wagen das adaptive M-Fahrwerk hat.",
    );
    expect(
      tf(de.draft.priceLine, { price, clarification: de.draft.clarificationMotorAuspuff }),
    ).toBe(
      "Richtpreis für das Paket: ab CHF 4'180, inklusive Einbau, ohne MFK. Den definitiven Preis bestätigen wir Ihnen, sobald wir die Kombination aus Software und Abgasanlage geprüft haben.",
    );
    expect(tf(de.draft.priceLine, { price, clarification: de.draft.clarificationGeneric })).toBe(
      "Richtpreis für das Paket: ab CHF 4'180, inklusive Einbau, ohne MFK. Den definitiven Preis bestätigen wir Ihnen, sobald wir die Details geklärt haben.",
    );
  });

  it("baut alle drei englischen Varianten zu vollständigen Sätzen zusammen", () => {
    const price = "from CHF 4'180";

    expect(tf(en.draft.priceLine, { price, clarification: en.draft.clarificationFahrwerk })).toBe(
      "Indicative price for the package: from CHF 4'180, including fitting, excluding roadworthiness test. We will confirm the final price once we know whether your car has the adaptive M suspension.",
    );
    expect(
      tf(en.draft.priceLine, { price, clarification: en.draft.clarificationMotorAuspuff }),
    ).toBe(
      "Indicative price for the package: from CHF 4'180, including fitting, excluding roadworthiness test. We will confirm the final price once we have checked the combination of software and exhaust system.",
    );
    expect(tf(en.draft.priceLine, { price, clarification: en.draft.clarificationGeneric })).toBe(
      "Indicative price for the package: from CHF 4'180, including fitting, excluding roadworthiness test. We will confirm the final price once we have clarified the details.",
    );
  });

  it("keine der drei Varianten enthält ein doppeltes Subjekt ('wir wir' / 'we we')", () => {
    for (const clarification of [
      de.draft.clarificationFahrwerk,
      de.draft.clarificationMotorAuspuff,
      de.draft.clarificationGeneric,
    ]) {
      const sentence = tf(de.draft.priceLine, { price: "ab CHF 100", clarification });
      expect(sentence).not.toMatch(/\bwir wir\b/i);
    }
  });
});

// draft.itemLine: Positionszeile mit Beschreibung und Preis, siehe
// docs/architektur.md ("• Motor: Stufe 1 (620 PS / 740 Nm), ab CHF 4'180").
describe("draft.itemLine: Positionszeile mit Beschreibung und Preis", () => {
  it("baut die Beispielzeile aus docs/architektur.md nach (de)", () => {
    const line = tf(de.draft.itemLine, {
      category: "Motor",
      name: "Stufe 1",
      description: tf(de.draft.itemDescription, { description: "620 PS / 740 Nm" }),
      price: tf(de.draft.itemPrice, { price: chf(4180) }),
    });
    expect(line).toBe("• Motor: Stufe 1 (620 PS / 740 Nm), ab CHF 4'180");
  });

  it("lässt Beschreibung und Preis ohne überflüssige Zeichen weg, wenn sie fehlen", () => {
    const line = tf(de.draft.itemLine, {
      category: "Exterieur",
      name: "Carbon Diffusor",
      description: "",
      price: "",
    });
    expect(line).toBe("• Exterieur: Carbon Diffusor");
  });

  it("bildet in Vorbereitung und auf Anfrage über eigene Preis-Bausteine ab", () => {
    const inPreparation = tf(de.draft.itemLine, {
      category: "Fahrwerk",
      name: "Spurstange HA einstellbar",
      description: "",
      price: de.draft.itemPriceInPreparation,
    });
    expect(inPreparation).toBe("• Fahrwerk: Spurstange HA einstellbar, in Vorbereitung");

    const onRequest = tf(de.draft.itemLine, {
      category: "Räder",
      name: "CDC1 FORGED Radsatz",
      description: "",
      price: de.draft.itemPriceOnRequest,
    });
    expect(onRequest).toBe("• Räder: CDC1 FORGED Radsatz, auf Anfrage");
  });

  it("baut dieselbe Zeile auf Englisch", () => {
    const line = tf(en.draft.itemLine, {
      category: "Engine",
      name: "Stage 1",
      description: tf(en.draft.itemDescription, { description: "620 PS / 740 Nm" }),
      price: tf(en.draft.itemPrice, { price: chf(4180) }),
    });
    expect(line).toBe("• Engine: Stage 1 (620 PS / 740 Nm), from CHF 4'180");
  });
});

describe("draft.subject / mail.inbox / mail.reply", () => {
  it("draft.subject enthält Fahrzeug und Nummer (de)", () => {
    expect(tf(de.draft.subject, { vehicle: "BMW M2 G87", number: "2026-0012" })).toBe(
      "Ihre Anfrage für den BMW M2 G87, Nr. 2026-0012",
    );
  });

  it("mail.inbox.subject enthält Nummer, Fahrzeug und Name (de)", () => {
    expect(
      tf(de.mail.inbox.subject, { number: "2026-0012", vehicle: "BMW M2 G87", name: "Max Muster" }),
    ).toBe("Neue Anfrage 2026-0012: BMW M2 G87, Max Muster");
  });

  it("mail.reply hat keinen eigenen Betreff (verwendet draft.subject)", () => {
    expect("subject" in de.mail.reply).toBe(false);
    expect(typeof de.mail.reply.footer).toBe("string");
  });
});
