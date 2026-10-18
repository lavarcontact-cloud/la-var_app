import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout contre le serveur Next (port 3400) branché sur la pile
 * Supabase LOCALE. Lancer d'abord `npm run db:start`, puis `npm run test:e2e`.
 */
const executablePath = process.env.PW_CHROMIUM || undefined;
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "e2e/report", open: "never" }]],
  use: { baseURL: "http://localhost:3400", locale: "fr-FR", timezoneId: "Europe/Paris", launchOptions: { executablePath } },
  webServer: { command: "npm run dev -- -p 3400", url: "http://localhost:3400", reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath } } },
  ],
});
