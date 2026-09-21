// Smoke-Tests für die Anfragen-Übersicht im Admin (CLAUDE.md Abschnitt
// "AUFGABE", Punkt 2/4): ganze Zeile klickbar, Aktualisieren-Button
// sichtbar, Live-Refresh übernimmt eine im Hintergrund (direkt in der DB,
// wie ein eingehender Kundenflow-Absender es täte) angelegte Anfrage ohne
// manuelles Neuladen. Läuft gegen die echte lokale API/DB (siehe
// playwright.config.ts, ADMIN_POLL_MS dort auf 3s verkürzt). Erzeugte
// Anfragen tragen ein eindeutiges Test-Präfix in der Nummer, damit sie
// danach gezielt wieder gelöscht werden können.
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

try {
  process.loadEnvFile(".env");
} catch {
  // .env nicht vorhanden: process.env muss DATABASE_URL dann schon enthalten.
}

const RUN_ID = Date.now();
const NUMBER_PREFIX = `E2E-ADM-${RUN_ID}`;

/** Meldet sich im Admin an (scripts/create-admin-users.ts, lokaler Dev-Fallback), wie tests/e2e/flow.spec.ts. */
async function adminLogin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("E-Mail").fill("admin@trendingmedia.ch");
  await page.getByLabel("Passwort").fill(process.env.ADMIN_TRENDINGMEDIA_PASSWORD ?? "daehler-admin-2026!");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/admin") && !u.pathname.includes("login"), { timeout: 30000 });
}

/** Legt eine minimale Test-Anfrage direkt in der DB an (Status "neu"), wie ein Absender im Hintergrund. Liefert die id. */
async function insertInquiry(number: string, firstName: string, lastName: string): Promise<string> {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into inquiries (
        number, share_token, status, first_name, last_name, city, email, phone, channel, character, timing
      ) values (
        ${number}, ${randomUUID()}, 'neu', ${firstName}, ${lastName}, 'Belp', ${`${number}@e2e.test`},
        '079 000 00 00', 'email', 'sportlich', 'flexible'
      )
      returning id
    `;
    return row.id;
  } finally {
    await sql.end();
  }
}

test.afterAll(async () => {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    await sql`delete from inquiries where number like ${NUMBER_PREFIX + "%"}`;
  } finally {
    await sql.end();
  }
});

test.describe("Admin-Übersicht: ganze Zeile klickbar", () => {
  test("Klick auf die Zeile ausserhalb der Nummer öffnet die Detailseite", async ({ page }) => {
    const number = `${NUMBER_PREFIX}-ROWCLICK`;
    const id = await insertInquiry(number, "Nadia", "Muster");

    await adminLogin(page);
    await page.goto("/admin");

    // Genau EIN Treffer, egal ob die Desktop-Tabelle oder die Mobile-Karte
    // gerade sichtbar ist (beide stehen im DOM, CSS blendet je Breakpoint
    // eine davon aus, siehe InquiriesTable.tsx).
    const customerCell = page.getByText("Nadia Muster", { exact: true }).and(page.locator(":visible"));
    await expect(customerCell).toBeVisible();
    await customerCell.click();

    await page.waitForURL(`**/admin/anfragen/${id}`, { timeout: 15000 });
  });

  test("die Nummer bleibt ein echter Link (eigenes href)", async ({ page }, testInfo) => {
    // Nur Desktop: dort ist die Nummer ein eigener <Link> NEBEN der
    // klickbaren Zeile (role="link" auf <tr>). Auf Mobile ist die ganze
    // Karte schon vorher EIN <Link> gewesen, die Nummer hat dort keinen
    // eigenen, zweiten Link (kein <a> im <a>).
    testInfo.skip(testInfo.project.name !== "desktop", "Eigener Nummer-Link nur in der Desktop-Tabelle, siehe InquiriesTable.tsx.");

    const number = `${NUMBER_PREFIX}-LINK`;
    const id = await insertInquiry(number, "Timo", "Sieber");

    await adminLogin(page);
    await page.goto("/admin");

    // exact: true, sonst matcht auch die Zeile selbst (role="link", deren
    // aria-label mit der Nummer beginnt: "<Nummer> – <Kunde>").
    const numberLink = page.getByRole("link", { name: number, exact: true });
    await expect(numberLink).toBeVisible();
    await expect(numberLink).toHaveAttribute("href", `/admin/anfragen/${id}`);
  });
});

test.describe("Anfrage-Detail: Zurück zur Übersicht", () => {
  test("«Zur Übersicht» führt zurück in die zuletzt gefilterte Übersicht", async ({ page }) => {
    const number = `${NUMBER_PREFIX}-BACK`;
    const id = await insertInquiry(number, "Reto", "Zurück");

    await adminLogin(page);
    await page.goto(`/admin?q=${encodeURIComponent(number)}`);

    const customerCell = page.getByText("Reto Zurück", { exact: true }).and(page.locator(":visible"));
    await expect(customerCell).toBeVisible();
    await customerCell.click();
    await page.waitForURL(`**/admin/anfragen/${id}`, { timeout: 15000 });

    await page.getByRole("link", { name: "Zur Übersicht" }).click();
    await page.waitForURL((u) => u.pathname === "/admin" && u.searchParams.get("q") === number, { timeout: 15000 });
  });

  test("ohne gemerkte Übersicht (Direkteinstieg) zeigt der Link auf /admin", async ({ page }) => {
    const number = `${NUMBER_PREFIX}-BACKDIRECT`;
    const id = await insertInquiry(number, "Dora", "Direkt");

    await adminLogin(page);
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`/admin/anfragen/${id}`);

    await expect(page.getByRole("link", { name: "Zur Übersicht" })).toHaveAttribute("href", "/admin");
  });
});

test.describe("Admin-Übersicht: Live-Refresh", () => {
  test("Aktualisieren-Button ist sichtbar", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");

    await expect(page.getByRole("button", { name: /Aktualisieren/ })).toBeVisible();
  });

  test("eine im Hintergrund angelegte Anfrage erscheint ohne manuelles Neuladen (Polling ADMIN_POLL_MS)", async ({ page }) => {
    await adminLogin(page);
    await page.goto("/admin");

    const number = `${NUMBER_PREFIX}-LIVE`;
    await insertInquiry(number, "Live", "Test");

    const newRow = page.getByText(number, { exact: true }).and(page.locator(":visible"));
    await expect(newRow).toBeVisible({ timeout: 40000 });
  });
});
