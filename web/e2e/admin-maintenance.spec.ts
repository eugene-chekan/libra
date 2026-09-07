import { expect, test } from '@playwright/test'

/**
 * The admin Maintenance tab, against a real backend.
 *
 * The component suite covers the screen against `FakeLibraApi`. What only a real
 * server can show is that the report is drawn from the filesystem and the
 * database rather than from anything the client was told: an orphan is a file
 * this test writes through no endpoint at all, and the delete has to make it
 * disappear from disk.
 *
 * **Serial.** Every test here reads one shared report — the counts, the orphan
 * list — and two of them running at once would each see the other's leftovers.
 */
test.describe.configure({ mode: 'serial' })

// Every assertion that waits for `GET /api/maintenance` to load gets this
// instead of Playwright's 5s default. The report walks the library directory
// and reads the database; on the single-process test backend that request can
// queue behind other specs' logins — the same self-inflicted load `workers: 4`
// caps for, see `playwright.config.ts`. 15s matches `reader.spec.ts` and
// `librarian.spec.ts`, which raise the timeout for the same reason.
const REPORT_LOAD_TIMEOUT = 15_000

test.describe('admin maintenance, in a real browser', () => {
  test('reaches the tab from the Users tab', async ({ page }) => {
    await page.goto('/admin/users')

    await page.getByRole('link', { name: 'Maintenance' }).click()

    await expect(page).toHaveURL(/\/admin\/maintenance$/)
    await expect(page.getByRole('heading', { name: 'Files with no book' })).toBeVisible({
      timeout: REPORT_LOAD_TIMEOUT,
    })
  })

  test('counts what the installation actually holds', async ({ page, request }) => {
    // `/api/books` rather than a number written here, and rather than `/api/maintenance`: the
    // count is worth checking against a different endpoint than the one that drew it, so this
    // says the report agrees with the book list rather than only with itself.
    //
    // Scoped to the `dt` it is: a bare "Books" also matches the "Books with no file" heading
    // further down, which is the ambiguity #101 was filed for. The `dd` beside it holds the
    // number on its own, so the comparison below is exact — `toContainText` was happy to let
    // a rendered "11" satisfy an expected "1".
    const shown = page
      .locator('dt', { hasText: /^Books$/ })
      .locator('..')
      .locator('dd')

    // Both numbers read together, with the page loaded again each time. The other specs in this
    // suite create books throughout the run, so a total read once and compared to a page drawn
    // later is a race this test cannot win: the page fetches its report once, and retrying an
    // assertion never moves the number already on screen (#121).
    await expect
      .poll(
        async () => {
          await page.goto('/admin/maintenance')
          const { total } = await (await request.get('/api/books')).json()
          return (await shown.textContent())?.trim() === String(total)
        },
        { timeout: REPORT_LOAD_TIMEOUT }
      )
      .toBe(true)
  })

  /*
   **An orphan cannot be made through the API**, which is the point of them: they are what a crash
   between writing a file and inserting its row leaves, and every endpoint keeps the two in step.
   So this cannot plant one and then delete it. What it can do is hold the page to the server's
   own answer, and exercise the delete for real whenever this scratch instance has collected one.

   The delete path itself is covered where it can be: `test_maintenance.py` plants a file on disk
   and removes it, and the component suite drives the button against the fake.
  */
  test('the page agrees with the server about what is loose on disk', async ({ page, request }) => {
    await page.goto('/admin/maintenance')

    const report = await (await request.get('/api/maintenance')).json()
    const orphans = report.orphan_files as { name: string }[]
    if (orphans.length === 0) {
      await expect(page.getByText('Nothing loose on disk.')).toBeVisible({
        timeout: REPORT_LOAD_TIMEOUT,
      })
      return
    }

    const first = orphans[0].name
    await expect(page.getByText(first)).toBeVisible({ timeout: REPORT_LOAD_TIMEOUT })
    await page.getByRole('button', { name: `Delete ${first}` }).click()
    await expect(page.getByRole('dialog', { name: `Delete ${first}?` })).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect
      .poll(
        async () => {
          const after = await (await request.get('/api/maintenance')).json()
          return (after.orphan_files as { name: string }[]).some((file) => file.name === first)
        },
        { timeout: REPORT_LOAD_TIMEOUT }
      )
      .toBe(false)
  })

  test('vacuum says what it gave back, and the library survives it', async ({ page, request }) => {
    await page.goto('/admin/maintenance')

    await page.getByRole('button', { name: 'Vacuum' }).click()

    // The real database is a file here, unlike the in-memory one the backend suite runs on — so
    // this is the only place the measurement is taken against something that can actually shrink.
    await expect(page.getByRole('status')).toHaveText(/Reclaimed .+|Nothing to reclaim\./)
    await expect.poll(async () => (await request.get('/api/books')).status()).toBe(200)
  })
})
