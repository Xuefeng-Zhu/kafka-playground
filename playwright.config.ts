import { defineConfig, devices } from "@playwright/test";

const nightly = process.env.PLAYWRIGHT_NIGHTLY === "true";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

// The demo server rate-limits mutations by client IP. Playwright projects are
// independent browser clients, so keep their mutation budgets isolated instead
// of collapsing every local request into the server's shared `local` bucket.
const clientIpByProject = {
  chromium: "198.51.100.10",
  firefox: "198.51.100.11",
  webkit: "198.51.100.12",
} as const;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // The demo runtime and mutation limiter are process-local. CI keeps one
  // worker per isolated browser job so scenario resets and experiments cannot
  // race through the same server process.
  workers: process.env.CI ? 1 : undefined,
  webServer: {
    command: "npm run dev:demo",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: {
          "x-forwarded-for": clientIpByProject.chromium,
        },
        viewport: { width: 1440, height: 900 },
      },
    },
    ...(nightly
      ? [
          {
            name: "firefox",
            use: {
              ...devices["Desktop Firefox"],
              extraHTTPHeaders: {
                "x-forwarded-for": clientIpByProject.firefox,
              },
              viewport: { width: 1440, height: 900 },
            },
          },
          {
            name: "webkit",
            use: {
              ...devices["Desktop Safari"],
              extraHTTPHeaders: {
                "x-forwarded-for": clientIpByProject.webkit,
              },
              viewport: { width: 1440, height: 900 },
            },
          },
        ]
      : []),
  ],
});
