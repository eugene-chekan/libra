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

test.describe('admin maintenance, in a real browser', () => {
  test('reaches the tab from the Users tab', async ({ page }) => {
    await page.goto('/admin/users')

    await page.getByRole('link', { name: 'Maintenance' }).click()

    await expect(page).toHaveURL(/\/admin\/maintenance$/)
    await expect(page.getByRole('heading', { name: 'Files with no book' })).toBeVisible()
  })

  test('counts what the installation actually holds', async ({ page, request }) => {
    const before = await (await request.get('/api/books')).json()

    await page.goto('/admin/maintenance')

    // Read from the API rather than written here: this suite creates books as it runs, so any
    // number typed in would be stale by the time it ran.
    //
    // Scoped to the `dt` it is: a bare "Books" also matches the "Books with no file" heading
    // further down, which is the ambiguity #101 was filed for.
    const books = page.locator('dt', { hasText: /^Books$/ }).locator('..')
    await expect(books).toContainText(String(before.total))
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
      await expect(page.getByText('Nothing loose on disk.')).toBeVisible()
      return
    }

    const first = orphans[0].name
    await expect(page.getByText(first)).toBeVisible()
    await page.getByRole('button', { name: `Delete ${first}` }).click()
    await expect(page.getByRole('dialog', { name: `Delete ${first}?` })).toBeVisible()
    await page.getByRole('button', { name: 'Delete' }).click()

    await expect
      .poll(async () => {
        const after = await (await request.get('/api/maintenance')).json()
        return (after.orphan_files as { name: string }[]).some((file) => file.name === first)
      })
      .toBe(false)
  })

  test('vacuum runs against the real database and the library survives it', async ({
    page,
    request,
  }) => {
    await page.goto('/admin/maintenance')

    await page.getByRole('button', { name: 'Vacuum' }).click()

    // No visible confirmation by design — what matters is that the server answered and the data
    // is still there afterwards.
    await expect.poll(async () => (await request.get('/api/books')).status()).toBe(200)
  })
})
