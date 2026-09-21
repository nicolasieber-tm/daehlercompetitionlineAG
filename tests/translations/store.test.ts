// lib/translations/store.ts gegen die lokale DB (Posten 4): automatische
// Einträge, manueller Schutz, Nachschlagen, Löschen. Eigener Quelltext-
// Präfix, wird am Ende restlos entfernt.
import { afterAll, describe, expect, it } from "vitest";
import {
  deleteTranslationsBySourcePrefix,
  getTranslationMap,
  saveManualTranslation,
  upsertAutoTranslations,
} from "@/lib/translations/store";

const PREFIX = `TEST-ÜBERSETZUNG-${Date.now()}-`;
const A = `${PREFIX}Heckflügel Carbon`;
const B = `${PREFIX}Frontgrill  Carbon`; // doppeltes Leerzeichen: wird normalisiert gespeichert

describe("product_translations (store)", () => {
  afterAll(async () => {
    await deleteTranslationsBySourcePrefix("en", PREFIX);
  });

  it("legt automatische Übersetzungen ab und findet sie über den normalisierten Schlüssel", async () => {
    const written = await upsertAutoTranslations(
      "en",
      [
        { source: A, translated: "Rear wing carbon" },
        { source: B, translated: "Front grille carbon" },
      ],
      "test-model",
    );
    expect(written).toBe(2);
    const map = await getTranslationMap("en", [A, `${PREFIX}Frontgrill Carbon`]);
    expect(map[A]).toBe("Rear wing carbon");
    expect(map[`${PREFIX}Frontgrill Carbon`]).toBe("Front grille carbon");
  });

  it("automatischer Lauf überschreibt automatische Einträge, aber nie manuelle", async () => {
    await saveManualTranslation("en", A, "Rear wing, carbon");
    const written = await upsertAutoTranslations(
      "en",
      [
        { source: A, translated: "ÜBERSCHRIEBEN" },
        { source: B, translated: "Front grille (carbon)" },
      ],
      "test-model",
    );
    expect(written).toBe(1);
    const map = await getTranslationMap("en", [A, B]);
    expect(map[A]).toBe("Rear wing, carbon");
    expect(map[`${PREFIX}Frontgrill Carbon`]).toBe("Front grille (carbon)");
  });

  it("leer speichern löscht den Eintrag", async () => {
    await saveManualTranslation("en", A, "   ");
    const map = await getTranslationMap("en", [A]);
    expect(map[A]).toBeUndefined();
  });
});
