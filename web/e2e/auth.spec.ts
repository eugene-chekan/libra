import { expect, test } from '@playwright/test'

// Every other spec reuses the signed-in cookie auth.setup.ts saves, so it
// does not have to sign in for itself. This file is the one place that
// cannot: it tests the signed-out path, and starting already signed in would
// test nothing.
test.use({ storageState: { cookies: [], origins: [] } })

/**
 * Login and session expiry, against a real backend.
 *
 * Every other e2e spec in this project needed nothing behind it — the
 * scaffold called no endpoint. This is the first milestone that fetches
 * anything, so it is the first that needs a backend actually running. Point
 * it at a scratch instance seeded non-interactively:
 *
 *   LIBRA_ADMIN_USERNAME=e2e-admin LIBRA_ADMIN_PASSWORD=e2e-password \
 *     uv run --directory ../backend uvicorn app.main:app --port 8000
 *
 * `npm run dev`'s proxy (vite.config.ts) sends `/api` there, so no
 * `LIBRA_CORS_ORIGINS` is needed. Override the credentials this file signs in
 * with via `LIBRA_E2E_USERNAME` / `LIBRA_E2E_PASSWORD` if the scratch
 * instance was seeded with different ones. See web/README.md.
 */

const USERNAME = process.env.LIBRA_E2E_USERNAME ?? 'e2e-admin'
const PASSWORD = process.env.LIBRA_E2E_PASSWORD ?? 'e2e-password'

async function signIn(page: import('@playwright/test').Page) {
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
}

test.describe('login and session expiry, in a real browser', () => {
  test('a signed-out reader is sent to /login, and back to the page they wanted', async ({
    page,
  }) => {
    await page.goto('/shelves')

    await expect(page).toHaveURL(/\/login\?next=/)
    await expect(page.getByRole('heading', { name: 'Libra' })).toBeVisible()

    await signIn(page)

    await expect(page).toHaveURL(/\/shelves$/)
    await expect(page.getByRole('heading', { name: 'Shelves' })).toBeVisible()
  })

  test('wrong credentials show the fixed copy, never which field was wrong', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Username').fill(USERNAME)
    await page.getByLabel('Password').fill('definitely-not-it')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('alert')).toHaveText('Incorrect username or password.')
    await expect(page).toHaveURL(/\/login/)
  })

  test('a live session survives a reload', async ({ page }) => {
    await page.goto('/login')
    await signIn(page)
    await expect(page).toHaveURL(/\/library$/)

    await page.reload()

    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  })

  test('signing out through the account dropdown clears the session', async ({ page }) => {
    await page.goto('/login')
    await signIn(page)
    await expect(page).toHaveURL(/\/library$/)

    await page.getByRole('button', { name: new RegExp(USERNAME, 'i') }).click()
    await page.getByRole('menuitem', { name: 'Sign Out' }).click()

    await expect(page).toHaveURL(/\/login/)

    // The cookie is gone server-side too, not only forgotten in the tab.
    await page.goto('/library')
    await expect(page).toHaveURL(/\/login\?next=/)
  })
})
