import { expect, test } from '@playwright/test'

import { buildMalformedEpub, buildMinimalEpub } from './epubFixture'

/**
 * Add Book, against a real backend. The component suite covers the modal's
 * own logic against `FakeLibraApi`; what only a real server can show is that
 * `POST /api/books/upload` actually parses a file's bytes rather than trusting
 * whatever the fake was told to say, and that the three failure shapes the
 * endpoint can answer with (415, 413, 422) reach the screen as the server's
 * own words.
 */
test.describe('Add Book, in a real browser', () => {
  test('drops a real EPUB, shows what the server parsed, and lands it in the library', async ({
    page,
  }) => {
    const title = `E2E Add Book ${Date.now()}`
    const epub = buildMinimalEpub({ title, author: 'E2E Author' })

    await page.goto('/library')
    await page.getByRole('button', { name: 'Add Book' }).click()
    await page.getByLabel(/drag an epub here/i).setInputFiles({
      name: 'upload.epub',
      mimeType: 'application/epub+zip',
      buffer: epub,
    })

    await expect(page.getByLabel('Title')).toHaveValue(title)
    await expect(page.getByLabel('Author')).toHaveValue('E2E Author')

    await page.getByRole('button', { name: 'Done' }).click()

    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()
  })

  test('refuses a non-EPUB with the server’s own sentence', async ({ page }) => {
    await page.goto('/library')
    await page.getByRole('button', { name: 'Add Book' }).click()
    await page.getByLabel(/drag an epub here/i).setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an epub'),
    })

    await expect(page.getByText('Only .epub files are supported in this phase')).toBeVisible()
    // Left in the drop step, not advanced to a confirmation for nothing.
    await expect(page.getByLabel(/drag an epub here/i)).toBeVisible()
  })

  test('refuses a file that is a zip but not a usable EPUB', async ({ page }) => {
    await page.goto('/library')
    await page.getByRole('button', { name: 'Add Book' }).click()
    await page.getByLabel(/drag an epub here/i).setInputFiles({
      name: 'broken.epub',
      mimeType: 'application/epub+zip',
      buffer: buildMalformedEpub(),
    })

    await expect(page.getByText(/Invalid EPUB/)).toBeVisible()
  })
})
