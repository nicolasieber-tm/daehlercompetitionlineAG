// Smoke-Tests für den Kundenflow, siehe docs/architektur.md ("E2E:
// @playwright/test (nur Smoke)") und CLAUDE.md Abschnitt "AUFGABE".
// Läuft gegen die echte lokale API/DB (siehe playwright.config.ts). Erzeugte
// Anfragen tragen eine @e2e.test E-Mail-Adresse, damit sie danach gezielt
// wieder gelöscht werden können (siehe Bericht: Aufräum-Skript).
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";

function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}@e2e.test`;
}

// .env selbst laden (wie scripts/migrate.ts): der Playwright-Testrunner-
// Prozess bekommt .env sonst nicht automatisch (nur der von webServer
// gestartete `next dev`-Prozess erbt process.env). Nur für den direkten
// DB-Check unten (inquiries.line) nötig.
try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss DATABASE_URL dann schon enthalten.
}

/** Öffnet die Startseite und wartet auf den ersten Schritt (Marken-Chips). */
async function openFlow(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Welches Fahrzeug fahren Sie?" })).toBeVisible();
}

/** Meldet sich im Admin an (scripts/create-admin-users.ts, lokaler Dev-Fallback), für die Schnellweg-API-Tests unten. */
async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill("admin@trendingmedia.ch");
  await page.getByLabel("Passwort").fill(process.env.ADMIN_TRENDINGMEDIA_PASSWORD ?? "daehler-admin-2026!");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/admin") && !u.pathname.includes("login"), { timeout: 30000 });
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
    // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 3):
    // M2 hat getriebespezifische Produkte (Kraftübertragung), die
    // Getriebefrage ist Pflicht vor "Weiter".
    await page.getByRole("button", { name: "Handschalter", exact: true }).click();
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
    // Getriebefrage (Rückmeldung erster Klicktest, CLAUDE.md Abschnitt
    // "AUFGABE", Punkt 3): M2 hat getriebespezifische Produkte, Pflicht vor
    // "Weiter".
    await page.getByRole("button", { name: "Handschalter", exact: true }).click();

    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 2: Wunsch. Motor + Auspuff wählen.
    await expect(page.getByRole("heading", { name: "Was darf es sein?" })).toBeVisible();
    await page.getByRole("button", { name: /^Motor/ }).click();
    await page.getByRole("button", { name: /^Auspuff/ }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Schritt 3: Motor. Stufe 1 (Basis 480 PS, 620 PS / 740 Nm) wählen,
    // PS-Zähler prüfen. Rückmeldung erster Klicktest (CLAUDE.md Abschnitt
    // "AUFGABE", Punkt 1): die Kachel zeigt jetzt "Stufe 1" · "620 PS / 740
    // Nm" · "M6 & A8-Getriebe" statt des vollen, mehrdeutigen Excel-Namens
    // (lib/catalog/product-display.ts) - "^Stufe 1.*620" grenzt sie von der
    // benachbarten "Stufe 1 mit V/max-Aufhebung"-Kachel (640 PS) ab.
    await expect(page.getByRole("heading", { name: "Wie viel darf es sein?" })).toBeVisible();
    await expect(page.getByText("Leistungsstufen", { exact: true })).toBeVisible();
    // Nachzug Prüfung Phase D, Punkt 4: M2 G87 hat unter "Leistungsstufen"
    // nur eine Gruppe ("DME Leistungssteigerungen:") - die Gruppenzeile darf
    // die Abschnittsüberschrift nicht mehr doppelt zeigen.
    await expect(page.getByText("DME Leistungssteigerungen:", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /^Stufe 1.*620/ }).click();
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

    // Nachzug Prüfung Phase D, Punkt 1: der Abschluss-Screen (Vorher/Nachher
    // und "Ihr Paket"-Summary) zeigt für die Leistungsstufe denselben kurzen
    // Titel wie die Kachel im Motor-Schritt ("Stufe 1", siehe oben), nicht
    // mehr den rohen Excel-Namen mit der Basis-Angabe ("(Basis 480 PS)").
    await expect(page.getByText("(Basis", { exact: false })).toHaveCount(0);

    // Fahrzeugbezeichnung (docs/architektur.md, Abschnitt
    // "Fahrzeugbezeichnung"; Kundenrückmeldung "BMW M2 G87, M2 liest sich
    // doppelt"): der Abschluss-Screen zeigt "BMW M2 (G87)" - Linie und
    // Modellname zu einem Satz verschmolzen, Code in Klammern - statt des
    // alten "BMW M2 G87, M2".
    await expect(page.getByText("BMW M2 (G87)").first()).toBeVisible();
    await expect(page.getByText("G87, M2")).toHaveCount(0);

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
    // Dieselbe Prüfung wie oben: die Teilen-Seite zeigt keinen rohen
    // Excel-Namen mit der Basis-Angabe.
    await expect(sharePage.getByText("(Basis", { exact: false })).toHaveCount(0);
    // /p/<token> zeigt dieselbe Fahrzeugbezeichnung wie der Abschluss-Screen.
    await expect(sharePage.getByText("BMW M2 (G87)").first()).toBeVisible();
    await expect(sharePage.getByText("G87, M2")).toHaveCount(0);
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
    await page.getByRole("button", { name: "Handschalter", exact: true }).click();
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
    await page.getByRole("button", { name: "Manual", exact: true }).click();
    await page.getByRole("button", { name: "Next →" }).click();

    await expect(page.getByRole("heading", { name: "What would you like?" })).toBeVisible();
    await page.getByRole("button", { name: /^Engine/ }).click();
    await page.getByRole("button", { name: "Next →" }).click();

    await expect(page.getByRole("heading", { name: "How much would you like?" })).toBeVisible();
    // Rückmeldung erster Klicktest (CLAUDE.md Abschnitt "AUFGABE", Punkt 1):
    // Titel lokalisiert ("Stage 1" statt "Stufe 1"), Rest des Produktnamens
    // (Detail "M6 & A8-Getriebe") bleibt Deutsch, auch in der englischen UI.
    // Eine Regex statt zwei separater Assertions: "M6 & A8-Getriebe" allein
    // träfe auch die benachbarte "Stage 1 with V-max removal"-Kachel
    // (dieselbe Getriebeangabe im Detail, andere PS/Nm-Werte).
    await expect(page.getByRole("button", { name: /^Stage 1.*620.*M6 & A8-Getriebe/ })).toBeVisible();
  });
});

// Rückmeldung erster Klicktest (Kundenflow M2 G87), siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkt 3: Getriebefrage filtert die Kraftübertragung-
// Optionen im Motor-Schritt.
test.describe("Getriebefrage filtert Kraftübertragung-Optionen (Rückmeldung erster Klicktest)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Handschalter: Schaltwegverkürzung sichtbar, Getriebeoptimierung ausgeblendet", async ({ page }) => {
    await openFlow(page);
    await page.getByRole("button", { name: "BMW", exact: true }).click();
    await page.getByRole("button", { name: /^M2 G87/ }).click();
    await page.getByRole("button", { name: "M2", exact: true }).click();
    await page.getByRole("button", { name: "480 PS", exact: true }).click();
    await page.getByRole("button", { name: "Handschalter", exact: true }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await page.getByRole("button", { name: /^Motor/ }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();
    await expect(page.getByRole("heading", { name: "Wie viel darf es sein?" })).toBeVisible();
    await expect(page.getByText("Kraftübertragung", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: /Schaltwegverkürzung für Handschalter/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Getriebeoptimierung/ })).toHaveCount(0);
  });

  test("Automat: Getriebeoptimierung sichtbar, Schaltwegverkürzung ausgeblendet", async ({ page }) => {
    await openFlow(page);
    await page.getByRole("button", { name: "BMW", exact: true }).click();
    await page.getByRole("button", { name: /^M2 G87/ }).click();
    await page.getByRole("button", { name: "M2", exact: true }).click();
    await page.getByRole("button", { name: "480 PS", exact: true }).click();
    await page.getByRole("button", { name: "Automat", exact: true }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await page.getByRole("button", { name: /^Motor/ }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();
    await expect(page.getByRole("heading", { name: "Wie viel darf es sein?" })).toBeVisible();
    await expect(page.getByText("Kraftübertragung", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: /Getriebeoptimierung St\.1 \/ 8 HP/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Schaltwegverkürzung/ })).toHaveCount(0);
  });
});

// Rückmeldung zweiter Klicktest (Kundenflow M2 G87), siehe CLAUDE.md
// Abschnitt "AUFGABE", Punkte 1-3. Werte aus der echten lokalen DB (nicht
// geraten, siehe Aufgabenstellung): M2 G87 "M2" Basis 460 PS hat zwei
// Stufe-1-Varianten, "... 590PS / 720Nm ..." (ohne V/max) und "... 610PS /
// 750Nm ... inkl. Anhebung der V/max Begrenzung" (mit V/max) - die gewählte
// Stufe hat ps_to 610/nm_to 750, models.series_nm ist für "M2" nicht
// gesetzt (null), Differenz zur Serienleistung 460 PS ist somit +150 PS
// ohne Nm-Angabe (siehe lib/catalog/power-before-after.ts).
test.describe("V/max-Doppelung und Vorher/Nachher-Leistung (Rückmeldung zweiter Klicktest)", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("Stufe 1 mit V/max-Aufhebung sperrt das eigenständige V/max-Produkt; Abschluss zeigt 460/610 gross und +150 PS; Kontakt ohne Ort absendbar", async ({
    page,
  }) => {
    await openFlow(page);
    await page.getByRole("button", { name: "BMW", exact: true }).click();
    await page.getByRole("button", { name: /^M2 G87/ }).click();
    await page.getByRole("button", { name: "M2", exact: true }).click();
    await page.getByRole("button", { name: "460 PS", exact: true }).click();
    await page.getByRole("button", { name: "Handschalter", exact: true }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await page.getByRole("button", { name: /^Motor/ }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await expect(page.getByRole("heading", { name: "Wie viel darf es sein?" })).toBeVisible();
    // Stufe 1 MIT V/max-Aufhebung wählen (610 PS, unterscheidet sie von der
    // benachbarten Stufe-1-Kachel ohne V/max-Zusatz, 590 PS).
    await page.getByRole("button", { name: /^Stufe 1.*610/ }).click();

    // Das eigenständige V/max-Produkt ist jetzt gesperrt: ausgegraut, nicht
    // wählbar, mit Hinweis "In Stufe 1 enthalten".
    const standaloneVmaxTile = page.getByRole("button", { name: /Aufhebung der serienmässigen V\/max Begrenzung/ });
    await expect(standaloneVmaxTile).toBeDisabled();
    await expect(standaloneVmaxTile.getByText("In Stufe 1 enthalten")).toBeVisible();

    // Zusätzlich eine Motor-Option NEBEN der Stufe wählen (Befund Prüfer,
    // Beleg Anfrage 2026-0293: "Sportluftfilter Satz", 320 CHF, unter
    // "Weitere Optionen" derselben Motor-Seite) - die Vorher/Nachher-Zeile
    // "Leistung" muss sie trotz gewählter Stufe (grosse Zahlen-Darstellung)
    // weiterhin zeigen, siehe components/flow/beforeAfter.ts row.extras.
    await page.getByRole("button", { name: "Sportluftfilter Satz" }).click();

    await page.getByRole("button", { name: "Weiter →" }).click();

    await expect(page.getByRole("heading", { name: /wirken/ })).toBeVisible();
    await page.getByRole("button", { name: "Sportlich" }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    // Kontakt: Vorname, Name, Telefon, E-Mail ausfüllen, Ort bewusst leer
    // lassen (Rückmeldung zweiter Klicktest, Punkt 2: Ort ist optional).
    await expect(page.getByRole("heading", { name: "Wann passt es Ihnen?" })).toBeVisible();
    await page.getByLabel("Vorname").fill("Lea");
    await page.getByLabel("Name", { exact: true }).fill("Vmax");
    await page.getByLabel("Telefon").fill("079 555 66 77");
    await page.getByLabel("E-Mail").fill(uniqueEmail("vmax-lock"));
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Anfrage senden →" }).click();

    await expect(page.getByText(/Nr\. \d{4}-\d{4}/)).toBeVisible({ timeout: 15000 });

    // Vorher/Nachher-Leistung: 460 (Serie) und 610 (Zielleistung der
    // gewählten Stufe) gross in der Display-Schrift (components/ui/
    // PowerValue.tsx), dazu das grüne Plus "+150 PS". Beide Layout-
    // Varianten (mobil gestapelt/Desktop-Grid) liegen im DOM, nur eine ist
    // bei 1280px sichtbar - auf sichtbare Elemente filtern.
    const bigNumbers = await page
      .locator("b.font-display.text-2xl.font-bold")
      .evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => el.textContent?.trim()));
    expect(bigNumbers).toContain("460");
    expect(bigNumbers).toContain("610");
    const plusTexts = await page
      .locator("span.font-mono.text-\\[13px\\].text-ok")
      .evaluateAll((els) => els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => el.textContent?.trim()));
    expect(plusTexts).toContain("+150 PS");

    // Befund Prüfer (major, Beleg Anfrage 2026-0293): die zusätzlich
    // gewählte Motor-Option ("Sportluftfilter Satz") muss trotz gewählter
    // Stufe (grosse Zahlen-Darstellung statt Text-Fallback) in der
    // "Leistung"-Zeile stehen bleiben, nicht nur im "Ihr Paket"-Summary.
    const leistungRow = page.locator("div.border-b.border-line.px-4.py-\\[11px\\]", { hasText: "Leistung" });
    await expect(leistungRow).toContainText("Sportluftfilter Satz");
  });
});

// Kundenentscheid 17.09.2026 ("bei X1 und X2 gibt es dieselben
// Motorisierungen, das Modell ist X1 oder X2"), siehe CLAUDE.md Abschnitt
// "AUFGABE" und docs/architektur.md Abschnitt "Fahrzeugbezeichnung". Familie
// "X1 U11 / X2 U10" (Excel-Import, lib/catalog/vehicle-label.ts
// vehicleLineIsAmbiguous()) ist für die Motorisierung "20i" mehrdeutig
// (teilt mit keiner der beiden Alternativen ein Wort) - der Flow fragt
// deshalb "Welches Modell fahren Sie?", die Wahl "X2" wird gespeichert und
// löst die Bezeichnung auf "BMW X2 20i (U10)" auf, statt der bisherigen
// "BMW X1 / X2 20i (U11, U10)"-Sammelform.
test.describe("Kundenflow: mehrdeutige Baureihe X1/X2, Modellwahl X2", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("BMW X1 U11 / X2 U10, 20i, Modell X2 -> Abschluss und Teilen-Seite zeigen 'BMW X2 20i (U10)'", async ({ page }) => {
    await openFlow(page);

    await page.getByRole("button", { name: "BMW", exact: true }).click();
    await page.getByRole("button", { name: /^X1 U11 \/ X2 U10/ }).click();
    await page.getByRole("button", { name: "20i", exact: true }).click();

    // Das Modell "20i" hat ein getriebespezifisches Produkt (Automat) -
    // die Getriebefrage ist Pflicht vor "Weiter" (siehe CarStep.tsx).
    await page.getByRole("button", { name: "Weiss ich nicht", exact: true }).click();

    // "Welches Modell fahren Sie?" - nur sichtbar, weil die Baureihe für
    // "20i" mehrdeutig ist (vehicleLineOptions()). "Weiter" bleibt ohne
    // Auswahl gesperrt (siehe Flow.tsx canNext).
    await expect(page.getByText("Welches Modell fahren Sie?")).toBeVisible();
    const weiter = page.getByRole("button", { name: "Weiter →" });
    await expect(weiter).toBeDisabled();
    await page.getByRole("button", { name: "X2", exact: true }).click();
    await expect(weiter).toBeEnabled();
    await weiter.click();

    // Wunsch: Komplettpaket ("beraten Sie mich") statt einzelner
    // Kategorien - hält den Test unabhängig von den konkreten Produkten
    // dieser Baureihe (nicht Gegenstand dieser Aufgabe).
    await expect(page.getByRole("heading", { name: "Was darf es sein?" })).toBeVisible();
    await page.getByRole("button", { name: "Beraten lassen" }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await expect(page.getByRole("heading", { name: /wirken/ })).toBeVisible();
    await page.getByRole("button", { name: "Sportlich" }).click();
    await page.getByRole("button", { name: "Weiter →" }).click();

    await expect(page.getByRole("heading", { name: "Wann passt es Ihnen?" })).toBeVisible();
    await page.getByLabel("Vorname").fill("Nina");
    await page.getByLabel("Name", { exact: true }).fill("X-Zwei");
    await page.getByLabel("Telefon").fill("079 111 22 33");
    const email = uniqueEmail("x1-x2-linie");
    await page.getByLabel("E-Mail").fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Anfrage senden →" }).click();

    await expect(page.getByText(/Nr\. \d{4}-\d{4}/)).toBeVisible({ timeout: 15000 });

    // Abschluss zeigt die aufgelöste Bezeichnung, nicht mehr die
    // Sammelform mit beiden Alternativen/Codes.
    await expect(page.getByText("BMW X2 20i (U10)").first()).toBeVisible();
    await expect(page.getByText("X1 / X2")).toHaveCount(0);

    // Teilen-Link: dieselbe Bezeichnung auf der read-only Seite.
    await page.getByRole("button", { name: /Ihr Paket als Link/ }).click();
    const code = page.locator("code");
    await expect(code).toBeVisible();
    const shareUrl = (await code.textContent())?.trim();
    expect(shareUrl).toBeTruthy();

    const sharePage = await page.context().newPage();
    await sharePage.goto(shareUrl!);
    await expect(sharePage.getByRole("heading", { name: /Ihr Paket/ })).toBeVisible();
    await expect(sharePage.getByText("BMW X2 20i (U10)").first()).toBeVisible();
    await expect(sharePage.getByText("X1 / X2")).toHaveCount(0);
    await sharePage.close();

    // inquiries.line = 'x2' (vehicleLineOptions()-id), direkt in der DB.
    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const [row] = await sql<{ line: string | null }[]>`
        select line from inquiries where email = ${email}
      `;
      expect(row?.line).toBe("x2");
    } finally {
      await sql.end();
    }
  });
});

// Prüfbefund 17.09.2026 (major): overridesSchema in
// app/api/admin/quick/create/route.ts kannte kein Feld "line" - zod
// entfernte den vom Admin-Dropdown geschickten Wert (QuickInquiryForm.tsx
// overrides.line) stillschweigend, die Anfrage landete ohne Modellwahl und
// feuerte weiterhin den Prüfhinweis "modell_mehrdeutig". Nur der
// automatische Abgleich über extraction.vehicle.line funktionierte. Deckt
// alle drei Wege ab: ohne jede Angabe (Hinweis feuert), automatischer
// Abgleich über extraction.vehicle.line (Hinweis feuert nicht), und die
// manuelle Korrektur über overrides.line allein (Befund selbst).
test.describe("Schnellweg: Modellwahl bei mehrdeutiger Baureihe (Admin-API)", () => {
  test("overrides.line kommt in inquiries.line an, wie extraction.vehicle.line", async ({ page }) => {
    await adminLogin(page);

    const baseExtraction = (line: string | null) => ({
      vehicle: { family_slug: "x1-u11-x2-u10", model_slug: "20i", free_text: "BMW X1/X2 20i", line, confidence: 0.9 },
      year: "2024",
      categories: ["auspuff"],
      selections: [],
      consulting: false,
      character: "sportlich",
      timing: "flexible",
      contact: { first_name: "Quick", last_name: "Test", city: null, phone: "079 000 00 00", email: null, channel: "phone" },
      message: "",
      open_questions: [],
      language: "de",
      uncertain: [],
    });

    async function create(line: string | null, overrides: Record<string, unknown>) {
      const email = uniqueEmail(`quick-line-${overrides.line ?? "none"}`);
      const res = await page.request.post("/api/admin/quick/create", {
        data: { text: `Testnotiz Schnellweg-Modellwahl ${email}`, extraction: baseExtraction(line), overrides: { ...overrides, email } },
      });
      const json = (await res.json()) as { ok: boolean; id?: string };
      expect(json.ok, JSON.stringify(json)).toBe(true);
      return { id: json.id!, email };
    }

    const none = await create(null, {});
    const auto = await create("X2", {});
    const override = await create(null, { line: "x2" });

    const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      const rows = await sql<{ id: string; line: string | null; checks: { id: string }[] }[]>`
        select id, line, checks from inquiries where id in (${none.id}, ${auto.id}, ${override.id})
      `;
      const by = (id: string) => rows.find((r) => r.id === id)!;

      expect(by(none.id).line).toBeNull();
      expect(by(none.id).checks.map((c) => c.id)).toContain("modell_mehrdeutig");

      expect(by(auto.id).line).toBe("x2");
      expect(by(auto.id).checks.map((c) => c.id)).not.toContain("modell_mehrdeutig");

      // Der eigentliche Befund: die Admin-Korrektur über overrides.line
      // (ohne automatischen Treffer aus der Extraction) muss ebenso
      // ankommen wie der automatische Abgleich oben.
      expect(by(override.id).line).toBe("x2");
      expect(by(override.id).checks.map((c) => c.id)).not.toContain("modell_mehrdeutig");
    } finally {
      await sql.end();
    }
  });
});
