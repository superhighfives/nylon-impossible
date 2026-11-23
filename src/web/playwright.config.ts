import { defineConfig, devices } from "@playwright/test";

/**
 * The smoke suite (e2e/). It runs against whatever BASE_URL points at: the
 * PR's preview deploy in CI (web-deploy.yml's `smoke` job), or a local
 * `vite dev` for development. See e2e/README.md.
 */

const baseURL = process.env.BASE_URL;
if (!baseURL) {
  throw new Error(
    "Set BASE_URL to the web app to test, e.g. BASE_URL=http://localhost:3000",
  );
}

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  // TEMPORARY (#821): proof run only.
  testMatch: /zz-proof/,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Every spec reseeds the one smoke user, so they take turns.
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  // One network hiccup against a fresh preview shouldn't stop a merge; a real
  // break fails twice.
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [
        ["list"],
        ["html", { open: "never" }],
        ["json", { outputFile: "test-results/results.json" }],
      ]
    : [["list"]],
  use: {
    baseURL,
    // The seed's due days and the browser agree on what "today" is.
    timezoneId: "UTC",
    locale: "en-GB",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      // Above WIDE_QUERY (1024px), so the board's columns and sidebar render.
      name: "wide",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // The phone layout, by touch. Chromium, not WebKit: the layouts switch
      // at WIDE_QUERY, not by engine, and one engine keeps the run short.
      name: "phone",
      use: { ...devices["iPhone 15"], defaultBrowserType: "chromium" },
    },
  ],
});
