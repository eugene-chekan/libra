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

/**
 * Opens the reader and waits for the book itself, not just for the area it renders into. The
 * area is on screen from the first paint, because epub.js measures it to size the chapter.
 *
 * The wait is generous on purpose: the whole archive is fetched and parsed in the browser, and
 * through the dev server that takes several seconds — longer than Playwright's default.
 */
async function openReader(page: Page, id: number, title: string): Promise<void> {
  await page.goto(`/books/${id}/read`)
  await expect(page.getByRole('region', { name: title })).toHaveAttribute('aria-busy', 'false', {
    timeout: 30_000,
  })
}

/**
 * The headings of every section epub.js currently has rendered. Continuous flow keeps several
 * sections alive at once, each in its own iframe, so this reads all of them rather than
 * assuming there is exactly one.
 */
async function renderedHeadings(page: Page): Promise<string[]> {
  const frames = page.frames().filter((frame) => frame !== page.mainFrame())
  const headings = await Promise.all(
    frames.map((frame) =>
      frame
        .locator('h1')
        .first()
        .textContent({ timeout: 2000 })
        .catch(() => null)
    )
  )
  return headings.filter((text): text is string => text !== null).map((text) => text.trim())
}

test.describe('the reader, in a real browser', () => {
  test('opens a book, shows a chapter, and sandboxes it', async ({ page, request }) => {
    const title = `E2E Reader ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    // The book opens on its title page: the first spine item, and one no contents list
    // mentions. Continuous flow is what lets a reader carry on from here into chapter one.
    await expect.poll(() => renderedHeadings(page)).toContain(title)

    // The security claim the whole design rests on: epub.js keeps the chapter in a sandboxed
    // iframe with no allow-scripts, so JavaScript inside an uploaded book never runs. If a
    // future epub.js changes this, it should fail here rather than quietly.
    const sandbox = await page.locator('[role="region"] iframe').first().getAttribute('sandbox')
    expect(sandbox).toBe('allow-same-origin')
  })

  test('the sidebar is gone, and Back returns to the book', async ({ page, request }) => {
    const title = `E2E Reader Frame ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

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

    await openReader(page, id, title)

    await page.getByRole('button', { name: 'Contents' }).click()
    for (const label of CHAPTERS) {
      await expect(page.getByRole('button', { name: label })).toBeVisible()
    }

    await page.getByRole('button', { name: 'The End' }).click()

    await expect.poll(() => renderedHeadings(page)).toContain('The End')
  })

  test('a text size is applied and survives a reload', async ({ page, request }) => {
    const title = `E2E Reader Size ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    await page.getByRole('button', { name: 'Text size and width' }).click()
    await page
      .getByRole('group', { name: 'Text size' })
      .getByRole('button', { name: 'Large' })
      .click()
    await page.keyboard.press('Escape')

    await page.reload()
    await expect(page.getByRole('region', { name: title })).toHaveAttribute('aria-busy', 'false', {
      timeout: 30_000,
    })

    await page.getByRole('button', { name: 'Text size and width' }).click()
    await expect(
      page.getByRole('group', { name: 'Text size' }).getByRole('button', { name: 'Large' })
    ).toHaveAttribute('aria-current', 'true')
  })

  test('the scroller spans the window, so the scrollbar is at its edge', async ({
    page,
    request,
  }) => {
    // The measure is set inside each chapter instead of by a narrow column, which is what lets
    // the scrollbar sit where a browser normally puts it.
    const title = `E2E Reader Scroller ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    const widths = await page.evaluate(() => {
      const container = document.querySelector('.epub-container')
      return {
        container: container ? Math.round(container.getBoundingClientRect().width) : 0,
        window: window.innerWidth,
      }
    })

    expect(widths.container).toBeGreaterThan(widths.window - 40)
  })

  test('the text is centred and capped, and Wide widens it', async ({ page, request }) => {
    const title = `E2E Reader Width ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    // epub.js writes the body's margin and padding as an inline style, so the measure only
    // holds if the injected rules are `!important`. Without that the text is wide and jammed
    // against the left edge, which is what this pins down.
    const measure = () =>
      page.frames()[1]!.evaluate(() => {
        const style = getComputedStyle(document.body)
        return {
          width: parseFloat(style.width),
          marginLeft: parseFloat(style.marginLeft),
          marginRight: parseFloat(style.marginRight),
        }
      })

    const medium = await measure()
    expect(medium.marginLeft).toBeGreaterThan(0)
    expect(Math.abs(medium.marginLeft - medium.marginRight)).toBeLessThan(2)

    await page.getByRole('button', { name: 'Text size and width' }).click()
    await page
      .getByRole('group', { name: 'Page width' })
      .getByRole('button', { name: 'Wide' })
      .click()
    await page.keyboard.press('Escape')

    await expect.poll(async () => (await measure()).width).toBeGreaterThan(medium.width)
  })

  test('the bar shows how far through the book the reader is', async ({ page, request }) => {
    const title = `E2E Reader Percent ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    await expect(page.getByText('0%')).toBeVisible()

    await page.getByRole('button', { name: 'Contents' }).click()
    await page.getByRole('button', { name: 'The End' }).click()

    await expect.poll(async () => page.getByText('%').first().textContent()).not.toBe('0%')
  })

  test('progress moves a point at a time, not a chapter at a time', async ({ page, request }) => {
    // The defect this exists to stop: the fraction was measured against epub.js's whole
    // continuous container, which holds only the sections currently loaded and is resized as
    // they come and go. It said nothing about position within a chapter, so the percentage
    // only ever moved when the chapter did — 0%, then 13%, on a book with eight sections.
    const title = `E2E Reader Steps ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    const percent = async () =>
      Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'))

    // Well inside a chapter, so neither reading is at a chapter boundary.
    await page.getByRole('button', { name: 'Contents' }).click()
    await page.getByRole('button', { name: 'The Middle' }).click()
    await page.waitForTimeout(500)

    const before = await percent()
    await page.evaluate(() => {
      const scroller = document.querySelector('.epub-container')
      if (scroller) scroller.scrollTop += 120
    })
    await expect.poll(percent).not.toBe(before)

    // A chapter's share of this book, which is what the old behaviour moved in one go. A
    // scroll of a few lines has to be a fraction of that, not all of it.
    const chapterShare = 100 / (CHAPTERS.length + 1)
    const after = await percent()
    expect(after).toBeGreaterThan(before)
    expect(after - before).toBeLessThan(chapterShare / 2)
  })

  test('the chapter is set like a printed page', async ({ page, request }) => {
    const title = `E2E Reader Paper ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    const typography = await page.frames()[1]!.evaluate(() => {
      const body = getComputedStyle(document.body)
      const paragraphs = document.querySelectorAll('p')
      const run = paragraphs[paragraphs.length - 1]
      return {
        align: body.textAlign,
        hyphens: body.hyphens || body.webkitHyphens,
        runIndent: run ? parseFloat(getComputedStyle(run).textIndent) : 0,
        runGap: run ? parseFloat(getComputedStyle(run).marginBottom) : -1,
      }
    })

    expect(typography.align).toBe('justify')
    expect(typography.hyphens).toBe('auto')
    // Indented run-on paragraphs with no gap between them, the way print sets prose.
    expect(typography.runIndent).toBeGreaterThan(0)
    expect(typography.runGap).toBe(0)
  })

  test('reading a chapter reaches the server as progress', async ({ page, request }) => {
    const title = `E2E Reader Progress ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    await page.getByRole('button', { name: 'Contents' }).click()
    await page.getByRole('button', { name: 'The Middle' }).click()
    await expect.poll(() => renderedHeadings(page)).toContain('The Middle')

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
