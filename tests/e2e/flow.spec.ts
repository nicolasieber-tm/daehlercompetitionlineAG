// Smoke-Tests für den Kundenflow, siehe docs/architektur.md ("E2E:
// @playwright/test (nur Smoke)") und CLAUDE.md Abschnitt "AUFGABE".
// Läuft gegen die echte lokale API/DB (siehe playwright.config.ts). Erzeugte
// Anfragen tragen eine @e2e.test E-Mail-Adresse, damit sie danach gezielt
// wieder gelöscht werden können (siehe Bericht: Aufräum-Skript).
import { test, expect, type Page } from "@playwright/test";

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}@e2e.test`;
}

/** Öffnet die Startseite und wartet auf den ersten Schritt (Marken-Chips). */
async function openFlow(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welches Fahrzeug fahren Sie?" })).toBeVisible();
}

// Prüfung, Befund 1 (major): next/font setzt die Variablen-Klassen
// (--font-barlow-condensed usw.) via app/layout.tsx auf <html> (== :root,
// siehe dortiger Kommentar) - app/globals.css referenziert sie dort im
// @theme-Block auf --font-display/--font-body/--font-mono. Vorher standen
// die Klassen auf <body>, die Tokens griffen dadurch NIE (var()-Verweis auf
// eine am :root-Element nicht deklarierte Custom Property macht die
// GANZE --font-display-Deklaration an :root ungültig, dieser ungültige Wert
// vererbt sich unverändert an alle Nachfahren) - der Browser fiel im
// gesamten Kundenflow auf die Fallback-Schriften zurück.
test.describe("Web-Fonts im Kundenflow (Prüfung, Befund 1)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Frage in Barlow Condensed, Fliesstext in Barlow, Preis in IBM Plex Mono", async ({ page }) => {
    await openFlow(page);

    // .q-Äquivalent (components/ui/StepLabel.tsx Question()).
    const heading = page.getByRole("heading", { name: "Welches Fahrzeug fahren Sie?" });
    await expect(heading).toHaveCSS("font-family", /Barlow Condensed/);

    // Body-Text: über document.body selbst (app/globals.css setzt
    // font-family dort auf --font-body, alles Weitere erbt davon). Muss mit
    // "Barlow," beginnen, NICHT mit "Barlow Condensed," (eigene Prüfung,
    // damit ein versehentliches Zurückfallen auf die Headline-Schrift
    // auffällt statt nur "enthält Barlow" zu prüfen).
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(bodyFont.startsWith("Barlow,"), `Body-Schrift war "${bodyFont}"`).toBe(true);

    // Preis: font-mono (Tailwind-Utility-Klasse, siehe components/ui/Tile.tsx
    // price-Span) im Motor-Schritt, wo Preise als Tile-Positionen erscheinen.
    await page.getByRole("button", { name: "BMW", exact: true }).click();
    await page.getByRole("button", { name: /^M2 G87/ }).click();
    await page.getByRole("button", { name: "M2", exact: true }).click();
    await page.getByRole("button", { name: "480 PS", exact: true }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();
    await page.getByRole("button", { name: /^Motor/ }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();
    await expect(page.getByRole("heading", { name: "Wie viel darf es sein?" })).toBeVisible();

    const price = page.locator(".font-mono").first();
    await expect(price).toBeVisible();
    await expect(price).toHaveCSS("font-family", /IBM Plex Mono/);
  });
});

test.describe("Kundenflow Desktop, BMW M2 G87 mit Preisen", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("BMW M2 G87 durch alle Schritte bis zum Teilen-Link", async ({ page }) => {
    await openFlow(page);

    // Schritt 1: Fahrzeug. BMW ist bereits vorausgewählt (erste Marke).
    await page.getByRole("button", { name: "BMW", exact: true }).click();
    await page.getByRole("button", { name: /^M2 G87/ }).click();
    await expect(page.getByRole("button", { name: /^M2 G87/ })).toHaveAttribute("aria-pressed", "true");

    // Motorisierung M2 (series_ps ist null, series_ps_suggested hat 2
    // Werte -> Serienleistungs-Chips erscheinen).
    await page.getByRole("button", { name: "M2", exact: true }).click();
    await page.getByRole("button", { name: "480 PS", exact: true }).click();

    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 2: Wunsch. Motor + Auspuff wählen.
    await expect(page.getByRole("heading", { name: "Was darf es sein?" })).toBeVisible();
    await page.getByRole("button", { name: /^Motor/ }).click();
    await page.getByRole("button", { name: /^Auspuff/ }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 3: Motor. Stufe 1 (Basis 480 PS) wählen, PS-Zähler prüfen.
    await expect(page.getByRole("heading", { name: "Wie viel darf es sein?" })).toBeVisible();
    await page.getByRole("button", { name: /Stufe 1.*480.*PS.*620PS/ }).click();
    await expect(page.locator("text=620").first()).toBeVisible();

    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 4: Auspuff. Upsell zurück zu Motor sollte NICHT erscheinen
    // (Motor bereits gewählt); stattdessen eine Position wählen und weiter.
    await expect(page.getByRole("heading", { name: "Welcher Sound?" })).toBeVisible();
    await page.getByRole("button", { name: /Komplettanlage/ }).click();

    // Upsell "Passt gut dazu: Räder" ist hier nicht vorgesehen (Auspuff
    // schlägt Motor vor, das ist schon gewählt) - der eigentliche
    // Fahrwerk/Räder-Upsell kommt erst im Fahrwerk-Schritt. Weiter zu wish
    // wurde oben nur motor+auspuff gewählt, also folgt jetzt "character".
    // Stattdessen testen wir den Upsell direkt hier über den Motor-Schritt:
    // zurück und die Fahrwerk-Kategorie ist nicht gewählt, wir nutzen den
    // vorhandenen Auspuff-Schritt-Upsell (Richtung Motor) nicht weiter,
    // sondern gehen weiter.
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt: Charakter (kein Fahrwerk/Räder gewählt, Upsell dort getestet
    // in einem eigenen Testschritt unten über "Dazunehmen").
    await expect(page.getByRole("heading", { name: /wirken/ })).toBeVisible();
    await page.getByRole("button", { name: "Sportlich" }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Kontakt ausfüllen und senden.
    await expect(page.getByRole("heading", { name: "Wann passt es Ihnen?" })).toBeVisible();
    await page.getByLabel("Vorname").fill("Max");
    await page.getByLabel("Name", { exact: true }).fill("Muster");
    await page.getByLabel("Ort").fill("Bern");
    await page.getByLabel("Telefon").fill("079 123 45 67");
    const email = uniqueEmail("desktop");
    await page.getByLabel("E-Mail").fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Anfrage senden →" }).click();

    // Abschluss: Nummer im Format JJJJ-NNNN und "ab CHF".
    await expect(page.getByText(/Nr\. \d{4}-\d{4}/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/ab CHF/).first()).toBeVisible();

    // Teilen-Link: kopieren und die read-only Seite öffnen.
    await page.getByRole("button", { name: /Ihr Paket als Link/ }).click();
    const code = page.locator("code");
    await expect(code).toBeVisible();
    const shareUrl = (await code.textContent())?.trim();
    expect(shareUrl).toBeTruthy();

    const sharePage = await page.context().newPage();
    await sharePage.goto(shareUrl!);
    await expect(sharePage.getByRole("heading", { name: /Ihr Paket/ })).toBeVisible();
    await expect(sharePage.getByRole("link", { name: "Eigene Anfrage starten" })).toBeVisible();
    await sharePage.close();
  });
});

test.describe("Kundenflow Desktop, Upsell Räder", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Fahrwerk waehlen, Raeder-Upsell dazunehmen", async ({ page }) => {
    await openFlow(page);
    await page.getByRole("button", { name: "BMW", exact: true }).click();
    await page.getByRole("button", { name: /^M2 G87/ }).click();
    await page.getByRole("button", { name: "M2", exact: true }).click();
    await page.getByRole("button", { name: "480 PS", exact: true }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await page.getByRole("button", { name: /^Fahrwerk/ }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await expect(page.getByRole("heading", { name: "Wie tief, wie hart?" })).toBeVisible();
    await expect(page.getByText("Passt gut dazu")).toBeVisible();
    await page.getByRole("button", { name: "Dazunehmen" }).click();
    await expect(page.getByText(/ist dabei/)).toBeVisible();

    await page.getByRole("button", { name: "Weiter →" }).click();
    await expect(page.getByRole("heading", { name: "Welche Räder?" })).toBeVisible();
  });
});

test.describe("Kundenflow Mobile, Kurzablauf", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Wiesmann Kurzablauf ohne Preise", async ({ page }) => {
    await openFlow(page);

    await page.getByRole("button", { name: "Wiesmann", exact: true }).click();
    await page.getByRole("button", { name: "Wiesmann", exact: true }).nth(1).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Wunsch (Kurzablauf: keine Produktschritte danach).
    await expect(page.getByRole("heading", { name: "Was darf es sein?" })).toBeVisible();
    await page.getByRole("button", { name: /^Motor/ }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Direkt Charakter (kein "cat:motor"-Schritt im Kurzablauf).
    await expect(page.getByRole("heading", { name: /wirken/ })).toBeVisible();
    await page.getByRole("button", { name: "Dezent" }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await expect(page.getByRole("heading", { name: "Wann passt es Ihnen?" })).toBeVisible();
    await page.getByLabel("Vorname").fill("Nina");
    await page.getByLabel("Name", { exact: true }).fill("Beispiel");
    await page.getByLabel("Ort").fill("Belp");
    await page.getByLabel("Telefon").fill("078 987 65 43");
    await page.getByLabel("E-Mail").fill(uniqueEmail("mobile"));
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Anfrage senden →" }).click();

    await expect(page.getByText(/Nr\. \d{4}-\d{4}/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("auf Anfrage").first()).toBeVisible();
  });
});

test.describe("Sprachwechsel", () => {
  test("EN: Texte englisch, Produktnamen deutsch", async ({ page }) => {
    await openFlow(page);

    await page.getByRole("group", { name: "Sprache" }).getByRole("button", { name: "EN" }).click();
    await expect(page.getByRole("heading", { name: "Which vehicle do you drive?" })).toBeVisible();

    await page.getByRole("button", { name: "BMW", exact: true }).click();
    await page.getByRole("button", { name: /^M2 G87/ }).click();
    await page.getByRole("button", { name: "M2", exact: true }).click();
    await page.getByRole("button", { name: "480 PS", exact: true }).click();
    await page.getByRole("button", { name: "Next →" }).click();

    await expect(page.getByRole("heading", { name: "What would you like?" })).toBeVisible();
    await page.getByRole("button", { name: /^Engine/ }).click();
    await page.getByRole("button", { name: "Next →" }).click();

    await expect(page.getByRole("heading", { name: "How much would you like?" })).toBeVisible();
    // Produktname bleibt Deutsch ("Stufe 1: ..."), auch in der englischen UI.
    await expect(page.getByText(/Stufe 1:.*480.*PS.*620PS/)).toBeVisible();
  });
});
