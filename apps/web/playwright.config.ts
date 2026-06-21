import { defineConfig, devices } from "@playwright/test";

// Load .env.local so the test runner sees the same OPENAI_API_KEY that `next dev`
// does — this lets the "live OpenAI" assertion actually run when a key is present
// (and self-skip in CI where there's no key file).
try {
  process.loadEnvFile(".env.local");
} catch {
  /* no local env file — the live-OpenAI test will skip */
}

// E2E suite for @mycelia/web. Drives the real app (real route handlers, real
// file-backed store, real cookie identity). The Ask flow hits OpenAI when
// OPENAI_API_KEY is set (loaded from .env.local by `next dev`); without a key
// the backend falls back deterministically, so the suite still passes in CI.
//
//   pnpm --filter @mycelia/web test:e2e          # headless run (auto-starts dev server)
//   pnpm --filter @mycelia/web test:e2e:ui       # interactive UI mode
//   pnpm --filter @mycelia/web test:e2e:install  # one-time: download chromium

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",
  // generous default: dev-mode first-compile + on-demand OpenAI calls
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
