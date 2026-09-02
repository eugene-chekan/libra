import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { buildReadableEpub } from './epubFixture'

/**
 * The in-browser reader, against a real backend and a real browser.
 *
 * The component suite covers every control against `FakeBookReader`. What only this can show is
 * epub.js itself: that the whole archive really is fetched with the session cookie, unzipped and
 * rendered, that its iframe carries the sandbox the whole design rests on, and that a position
 * scrolled here survives a reload.
 *
 * Seeds its own book per run, with a unique title, because this suite does not own the scratch
 * database the way a unit test owns its fake.
 */

const CHAPTERS = ['The Beginning', 'The Middle', 'The End']

async function uploadBook(request: APIRequestContext, title: string): Promise<number> {
  const response = await request.post('/api/books/upload', {
    multipart: {
      file: {
        name: `${title}.epub`,
        mimeType: 'application/epub+zip',
        buffer: buildReadableEpub({ title, author: 'E2E Author', chapters: CHAPTERS }),
      },
    },
  })
  expect(response.ok()).toBe(true)
  const book = (await response.json()) as { id: number }
  return book.id
}

/** The chapter epub.js has rendered, read from inside its iframe. */
function chapterHeading(page: Page) {
  return page.frameLocator('[role="region"] iframe').locator('h1').first()
}

test.describe('the reader, in a real browser', () => {
  test('opens a book, shows a chapter, and sandboxes it', async ({ page, request }) => {
    const title = `E2E Reader ${Date.now()}`
    const id = await uploadBook(request, title)

    await page.goto(`/books/${id}/read`)

    await expect(page.getByRole('region', { name: title })).toBeVisible()
    await expect(chapterHeading(page)).toHaveText(CHAPTERS[0]!)

    // The security claim the whole design rests on: epub.js keeps the chapter in a sandboxed
    // iframe with no allow-scripts, so JavaScript inside an uploaded book never runs. If a
    // future epub.js changes this, it should fail here rather than quietly.
    const sandbox = await page.locator('[role="region"] iframe').first().getAttribute('sandbox')
    expect(sandbox).toBe('allow-same-origin')
  })

  test('the sidebar is gone, and Back returns to the book', async ({ page, request }) => {
    const title = `E2E Reader Frame ${Date.now()}`
    const id = await uploadBook(request, title)

    await page.goto(`/books/${id}/read`)
    await expect(page.getByRole('region', { name: title })).toBeVisible()

    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  })

  test('the contents drawer lists the book’s own chapters and jumps to one', async ({
    page,
    request,
  }) => {
    const title = `E2E Reader Contents ${Date.now()}`
    const id = await uploadBook(request, title)

    await page.goto(`/books/${id}/read`)
    await expect(page.getByRole('region', { name: title })).toBeVisible()

    await page.getByRole('button', { name: 'Contents' }).click()
    for (const label of CHAPTERS) {
      await expect(page.getByRole('button', { name: label })).toBeVisible()
    }

    await page.getByRole('button', { name: 'The End' }).click()

    await expect(chapterHeading(page)).toHaveText('The End')
  })

  test('a text size is applied and survives a reload', async ({ page, request }) => {
    const title = `E2E Reader Size ${Date.now()}`
    const id = await uploadBook(request, title)

    await page.goto(`/books/${id}/read`)
    await expect(page.getByRole('region', { name: title })).toBeVisible()

    await page.getByRole('button', { name: 'Text size' }).click()
    await page.getByRole('button', { name: 'Large' }).click()

    await page.reload()
    await expect(page.getByRole('region', { name: title })).toBeVisible()

    await page.getByRole('button', { name: 'Text size' }).click()
    await expect(page.getByRole('button', { name: 'Large' })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  test('reading a chapter reaches the server as progress', async ({ page, request }) => {
    const title = `E2E Reader Progress ${Date.now()}`
    const id = await uploadBook(request, title)

    await page.goto(`/books/${id}/read`)
    await expect(page.getByRole('region', { name: title })).toBeVisible()

    await page.getByRole('button', { name: 'Contents' }).click()
    await page.getByRole('button', { name: 'The Middle' }).click()
    await expect(chapterHeading(page)).toHaveText('The Middle')

    await expect
      .poll(
        async () => {
          const response = await request.get(`/api/books/${id}`)
          const book = (await response.json()) as { progress: number }
          return book.progress
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(0)
  })
})
