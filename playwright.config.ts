// Playwright-Konfiguration für die Smoke-Tests des Kundenflows, siehe
// docs/architektur.md ("E2E: @playwright/test (nur Smoke)") und
// tests/e2e/flow.spec.ts. baseURL aus PLAYWRIGHT_BASE_URL (Default: der
// lokale Dev-Server unten), webServer startet `next dev` auf Port 3150
// selbst, wenn er nicht schon läuft (reuseExistingServer).
import { defineConfig, devices } from "@playwright/test";

const PORT = 3150;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    // "Ihr Paket als Link" schreibt in die Zwischenablage (navigator.clipboard),
    // Chromium verweigert das im Test ohne explizite Berechtigung.
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Mobile-Viewport auf Chromium statt des "iPhone 13"-Presets (WebKit):
      // nur Chromium wird installiert (siehe Aufgabenstellung "Browser
      // installieren: npx playwright install chromium, falls nötig").
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `PORT=${PORT} npx next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        // E2E-Läufe dürfen keine echten Mails über Resend auslösen (Tages-
        // kontingent des Testkontos): ohne API-Key protokolliert sendMail()
        // jeden Versuch als "failed" in outbound_emails, mehr nicht.
        env: { ...process.env, RESEND_API_KEY: "" },
      },
});
