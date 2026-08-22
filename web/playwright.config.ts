import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests, in a real browser.
 *
 * This file could not have existed under Flutter. The client painted itself
 * onto one canvas, so there was nothing in the page for a browser-driving tool
 * to find or click — which is how issue #50 was discovered, and why
 * docs/evaluation.md used to say the client had no automated evaluation.
 *
 * Chromium alone. The application is desktop-only by design and self-hosted on
 * a home network; running the same assertions three times in three engines
 * would triple CI for a risk this project does not carry.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A test that only passes on a retry is a flaky test, and this suite is
  // small enough to fix rather than paper over.
  retries: 0,
  // This milestone is the first spec to hit a real backend, and that backend
  // is one process doing real Argon2 hashing against a single SQLite file —
  // the same shape as the household instance this app actually ships to,
  // which never sees more than a couple of people signing in at once. Left at
  // Playwright's own default (half the machine's cores, easily 8+ in CI),
  // several logins land on that one process in the same instant and Argon2's
  // deliberately-slow hashing queues up, so a login can outrun the default
  // assertion timeout under nothing but self-inflicted load. Capping it here
  // matches the concurrency the app is actually built for.
  workers: 4,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    // Overridable so the same suite can run against a real instance — a
    // production build served by the backend — and not only against Vite's dev
    // server. The two differ in ways that matter: the dev server has its own
    // SPA fallback, so a reload test passes there whether or not the backend
    // has one. Point it at `scripts/run.sh` to check the thing that ships.
    baseURL: process.env.LIBRA_E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    // Signs in once and saves the cookie to e2e/.auth/user.json — see
    // auth.setup.ts. Needs a real backend behind the proxy; every other spec
    // depends on this one having run first.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],

  // The scaffold calls no endpoints, so the backend does not need to be up.
  // The first milestone that fetches anything will need one here too.
  // Skipped when pointed at an instance that is already running.
  ...(process.env.LIBRA_E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
})
