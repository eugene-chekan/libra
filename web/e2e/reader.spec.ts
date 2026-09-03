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

/**
 * A book with as many sections as a real one. How far a resume misses grows with the number of
 * sections around the target, because each one epub.js fills in above it moves the page.
 */
const LONG_BOOK = Array.from({ length: 12 }, (_, n) => `Chapter ${n + 1}`)

async function uploadBook(
  request: APIRequestContext,
  title: string,
  shape: { chapters?: string[]; paragraphs?: number } = {}
): Promise<number> {
  const response = await request.post('/api/books/upload', {
    multipart: {
      file: {
        name: `${title}.epub`,
        mimeType: 'application/epub+zip',
        buffer: buildReadableEpub({
          title,
          author: 'E2E Author',
          chapters: shape.chapters ?? CHAPTERS,
          paragraphs: shape.paragraphs,
        }),
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
 * Waits until the book has been measured.
 *
 * Measuring walks every chapter and marks a position every thousand characters, and it runs in
 * the background — until it lands the percentage is still the rough chapter estimate and a
 * resume can only land near. The stored measurement appearing is the signal that it is done.
 */
async function waitForMeasured(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.keys(localStorage).some((k) => k.startsWith('libra.locations.'))
        ),
      { timeout: 30_000 }
    )
    .toBe(true)
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

  test('progress moves while the reader stays inside one chapter', async ({ page, request }) => {
    // The defect this exists to stop: progress counted chapters, so it could only move by
    // changing chapter — 0%, then 13%, on a book with eight sections, with nothing in between
    // however far you read. It is measured against the book's text now.
    const title = `E2E Reader Steps ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    const percent = async () =>
      Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'))

    await waitForMeasured(page)

    await page.getByRole('button', { name: 'Contents' }).click()
    await page.getByRole('button', { name: 'The Middle' }).click()
    await expect.poll(() => renderedHeadings(page)).toContain('The Middle')
    await page.waitForTimeout(800)

    // Steps measured against the chapter's own height rather than in pixels. A runner with no
    // Georgia installed lays the same chapter out much taller, and a fixed 200px step there
    // never reaches the next measured position, so the number legitimately does not move.
    // The tallest rendered section, not the first one. The first is the title page, which is a
    // few lines long — an eighth of it is 36 pixels, and six of those do not reach the next
    // measured position, so the number legitimately never moves.
    const step = await page.evaluate(() => {
      const heights = Array.from(document.querySelectorAll('.epub-view')).map(
        (view) => view.getBoundingClientRect().height
      )
      return Math.round(Math.max(0, ...heights) / 8)
    })
    expect(step).toBeGreaterThan(0)

    // Counting chapters gives the same number for every one of these; measuring the text gives
    // a different one as the reading goes on.
    const readings = new Set<number>([await percent()])
    for (let taken = 0; taken < 6; taken++) {
      await page.evaluate((by) => {
        const scroller = document.querySelector('.epub-container')
        if (scroller) scroller.scrollTop += by
      }, step)
      await page.waitForTimeout(300)
      readings.add(await percent())
    }

    expect(readings.size).toBeGreaterThanOrEqual(3)
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

  test('coming back to a book returns to the same place, not near it', async ({
    page,
    request,
  }) => {
    // The round trip Continue Reading actually makes.
    //
    // A long book on purpose. epub.js can be asked to show an exact address, but under the
    // continuous manager it gets there by scrolling *relative* to wherever the reader already
    // was, so the same address lands somewhere different on every open — six or seven points
    // out on a book this size. A short fixture hides that: one measured position there is
    // worth two points, so any error fits inside one.
    const title = `E2E Reader Resume ${Date.now()}`
    const id = await uploadBook(request, title, { chapters: LONG_BOOK, paragraphs: 200 })
    const stored = async () => {
      const response = await request.get(`/api/books/${id}`)
      return ((await response.json()) as { progress: number }).progress
    }
    const shown = async () =>
      Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'))

    await openReader(page, id, title)
    await waitForMeasured(page)
    await page.getByRole('button', { name: 'Contents' }).click()
    await page.getByRole('button', { name: 'Chapter 5' }).click()
    // The percentage moving is the signal the jump landed. Counting rendered headings is not:
    // on a book this size epub.js has the sections in the page well before the browser has
    // attached their frames.
    await expect.poll(shown, { timeout: 20_000 }).toBeGreaterThan(10)

    await expect.poll(stored, { timeout: 15_000 }).toBeGreaterThan(0)
    const atChapterStart = await stored()

    // Stop well inside the chapter, where a reader actually stops, and wait for that position
    // to be the stored one. Landing back on a chapter's first line is the one case the old
    // seek got right, because the scroll it adds is zero.
    await page.waitForTimeout(500)
    await page.evaluate(() => {
      const view = document.querySelector('.epub-view')
      const scroller = document.querySelector('.epub-container')
      if (view && scroller) scroller.scrollTop += view.getBoundingClientRect().height / 2
    })
    await expect.poll(stored, { timeout: 15_000 }).toBeGreaterThan(atChapterStart)
    const left = await stored()

    // Leave and come back, which is what Continue Reading does.
    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await openReader(page, id, title)
    await waitForMeasured(page)
    // Polled rather than asserted once: under a loaded machine the resume lands a beat after
    // the book is open, and reading the bar at a fixed moment catches it mid-flight.
    await expect
      .poll(async () => Math.abs((await shown()) / 100 - left), { timeout: 20_000 })
      .toBeLessThan(0.02)

    // And the place it came back to is the place it keeps. Opening a book writes back where
    // the resume landed, so a resume that lands short walks the position down a few points
    // every single time the book is opened.
    await page.waitForTimeout(2500)
    expect(Math.abs((await stored()) - left)).toBeLessThan(0.02)
  })
})
