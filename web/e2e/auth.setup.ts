import { expect, test as setup } from '@playwright/test'

/**
 * Runs once, before every other spec, and saves the resulting session cookie
 * to `e2e/.auth/user.json` for them to reuse. Every spec but `auth.spec.ts`
 * itself is about something else — the sidebar, the shell — and needs a
 * signed-in session only to get past the guard, not as the thing under test.
 * Making each of those specs sign in for itself would repeat the same three
 * steps in every one and slow the whole suite down for no coverage gained.
 *
 * `auth.spec.ts` opts out of this file's saved session (`test.use({
 * storageState: ... })` at its own top) because it tests the signed-out path,
 * and starting it already signed in would test nothing.
 */

const USERNAME = process.env.LIBRA_E2E_USERNAME ?? 'e2e-admin'
const PASSWORD = process.env.LIBRA_E2E_PASSWORD ?? 'e2e-password'

setup('sign in once, for every other spec to reuse', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()

  await expect(page).toHaveURL(/\/library$/)
  await page.context().storageState({ path: 'e2e/.auth/user.json' })
})
