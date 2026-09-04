import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { buildReadableEpub } from './epubFixture'

/**
 * The in-browser reader, against a real backend and a real browser.
 *
 * The component suite covers every control against `FakeBookReader`. What only this can show is
 * epub.js itself: that the whole archive really is fetched with the session cookie, unzipped
 * and rendered, that its iframe carries the sandbox the whole design rests on, that the text
 * lays out in two columns on a wide window, and that a page left here is the page returned to.
 *
 * Seeds its own book per run, with a unique title, because this suite does not own the scratch
 * database the way a unit test owns its fake.
 */

const CHAPTERS = ['The Beginning', 'The Middle', 'The End']

/** A book with as many sections as a real one. */
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
 * area is on screen from the first paint, because epub.js measures it to size the page.
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
 * Waits until the book has been measured. Until it is there is no percentage at all, by
 * design: a number nobody knows yet is left blank rather than guessed at.
 */
async function waitForMeasured(page: Page): Promise<void> {
  // Attached, not visible: the bar is the read part of a rule, so at 0% it is zero pixels wide
  // and a browser calls that hidden. Its presence is the signal, not its size.
  await expect(page.getByRole('progressbar')).toBeAttached({ timeout: 30_000 })
}

/** The reader's stored state, straight from the server. */
async function storedState(
  request: APIRequestContext,
  id: number
): Promise<{ progress: number; position: string | null }> {
  const response = await request.get(`/api/books/${id}`)
  return (await response.json()) as { progress: number; position: string | null }
}

/** The headings of every section epub.js currently has rendered. */
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

/**
 * How many columns epub.js has laid the page out in.
 *
 * It sets `column-width` and `column-gap` in pixels on the book's own `body` — not on the root
 * element, and it leaves `column-count` at `auto` — so the count has to be worked out: how many
 * of those columns, gap included, fit across the page.
 */
async function columnCount(page: Page): Promise<number> {
  const frame = page.frames().find((each) => each !== page.mainFrame())
  if (!frame) return 0
  try {
    return await frame.evaluate(() => {
      const style = getComputedStyle(document.body)
      const columnWidth = Number.parseFloat(style.columnWidth)
      const gap = Number.parseFloat(style.columnGap) || 0
      const across = document.body.clientWidth
      if (!columnWidth || !across) return 1
      return Math.max(1, Math.round(across / (columnWidth + gap)))
    })
  } catch {
    // Laying out again replaces the iframe, so a handle taken a moment ago can already be
    // gone. Answering 0 makes the caller poll again rather than fail on the gap.
    return 0
  }
}

test.describe('the reader, in a real browser', () => {
  test('opens a book, shows a chapter, and sandboxes it', async ({ page, request }) => {
    const title = `E2E Reader ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    await expect.poll(() => renderedHeadings(page)).not.toHaveLength(0)

    // The whole design rests on this: the book's own scripts never run.
    const sandbox = await page.locator('iframe').first().getAttribute('sandbox')
    expect(sandbox).toContain('allow-same-origin')
    expect(sandbox).not.toContain('allow-scripts')
  })

  test('lays the page out in two columns on a wide window, and one on a narrow one', async ({
    page,
    request,
  }) => {
    // epub.js splits at 800px. A wide desktop window should read like an open book.
    const title = `E2E Reader Columns ${Date.now()}`
    const id = await uploadBook(request, title)

    await page.setViewportSize({ width: 1280, height: 900 })
    await openReader(page, id, title)
    await expect.poll(() => columnCount(page), { timeout: 15_000 }).toBe(2)

    await page.setViewportSize({ width: 700, height: 900 })

    await expect.poll(() => columnCount(page), { timeout: 15_000 }).toBe(1)
  })

  test('turns a page forward and back to the same place', async ({ page, request }) => {
    const title = `E2E Reader Turn ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)
    await waitForMeasured(page)
    const first = await page.getByRole('progressbar').getAttribute('aria-valuenow')

    await page.getByRole('button', { name: 'Next page' }).click()
    await expect
      .poll(async () => page.getByRole('progressbar').getAttribute('aria-valuenow'))
      .not.toBe(first)

    await page.getByRole('button', { name: 'Previous page' }).click()

    await expect
      .poll(async () => page.getByRole('progressbar').getAttribute('aria-valuenow'))
      .toBe(first)
  })

  test('cannot turn back from the first page', async ({ page, request }) => {
    const title = `E2E Reader First ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  })

  test('turns pages from the keyboard too', async ({ page, request }) => {
    const title = `E2E Reader Keys ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)
    await waitForMeasured(page)
    const first = await page.getByRole('progressbar').getAttribute('aria-valuenow')

    await page.keyboard.press('ArrowRight')

    await expect
      .poll(async () => page.getByRole('progressbar').getAttribute('aria-valuenow'))
      .not.toBe(first)
  })

  test('the sidebar is gone, and Back returns to the book', async ({ page, request }) => {
    const title = `E2E Reader Chrome ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    await expect(page.getByRole('navigation')).toHaveCount(0)

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

    for (const chapter of CHAPTERS) {
      await expect(page.getByRole('button', { name: chapter })).toBeVisible()
    }

    await page.getByRole('button', { name: 'The Middle' }).click()

    await expect.poll(() => renderedHeadings(page)).toContain('The Middle')
  })

  test('names the chapter in the bar, beside the book', async ({ page, request }) => {
    const title = `E2E Reader Chapter ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)
    await page.getByRole('button', { name: 'Contents' }).click()
    await page.getByRole('button', { name: 'The Middle' }).click()

    await expect(page.getByText('· The Middle')).toBeVisible()
  })

  test('the page count is not a count of screenfuls', async ({ page, request }) => {
    // The whole reason these pages are counted from the text rather than from the screen. A
    // screenful count would grow as the text got bigger — "of 22" becoming "of 40" for the
    // same book. The length of the book does not change, so neither does the total.
    //
    // The page the reader is on can still move by one: it is the page that *starts* at the top
    // of the screen, and where a page starts does change when the text is laid out again.
    const title = `E2E Reader Pages ${Date.now()}`
    const id = await uploadBook(request, title, { paragraphs: 200 })

    await openReader(page, id, title)
    await waitForMeasured(page)
    const pages = page.getByText(/^p\. \d+ of \d+$/)
    await expect(pages).toBeVisible()
    for (let turn = 0; turn < 4; turn++) {
      await page.getByRole('button', { name: 'Next page' }).click()
    }
    const read = async () => {
      const text = (await pages.textContent()) ?? ''
      const [, current, total] = /^p\. (\d+) of (\d+)$/.exec(text) ?? []
      return { current: Number(current), total: Number(total) }
    }
    const before = await read()

    await page.getByRole('button', { name: 'Text size and width' }).click()
    await page
      .getByRole('group', { name: 'Text size' })
      .getByRole('button', { name: 'Large' })
      .click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1500)
    const after = await read()

    expect(after.total).toBe(before.total)
    expect(Math.abs(after.current - before.current)).toBeLessThanOrEqual(1)
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

    const sized = async () => {
      const frame = page.frames().find((each) => each !== page.mainFrame())
      if (!frame) return ''
      return frame.evaluate(() => getComputedStyle(document.body).fontSize)
    }
    const large = await sized()

    await openReader(page, id, title)

    await expect.poll(sized, { timeout: 15_000 }).toBe(large)
  })

  test('the chapter is set like a printed page', async ({ page, request }) => {
    const title = `E2E Reader Print ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)

    const frame = page.frames().find((each) => each !== page.mainFrame())
    expect(frame).toBeDefined()
    // Not the first paragraph: the one after a heading starts flush by design, as it does in
    // print. Any later one carries the indent.
    const paragraph = await frame!.evaluate(() => {
      const p = document.querySelectorAll('p')[3]
      if (!p) return null
      const style = getComputedStyle(p)
      return { align: style.textAlign, indent: style.textIndent }
    })

    expect(paragraph?.align).toBe('justify')
    expect(paragraph?.indent).not.toBe('0px')
  })

  test('reading reaches the server as progress and a place', async ({ page, request }) => {
    const title = `E2E Reader Write ${Date.now()}`
    const id = await uploadBook(request, title)

    await openReader(page, id, title)
    await waitForMeasured(page)
    expect((await storedState(request, id)).position).toBeNull()

    await page.getByRole('button', { name: 'Next page' }).click()

    await expect
      .poll(async () => (await storedState(request, id)).position, { timeout: 15_000 })
      .not.toBeNull()
    expect((await storedState(request, id)).progress).toBeGreaterThan(0)
  })

  test('coming back to a book returns to the page it was left on', async ({ page, request }) => {
    // The round trip Continue Reading makes. A long book on purpose: on a short one every
    // position is close to every other, and a resume that missed would still look right.
    const title = `E2E Reader Resume ${Date.now()}`
    const id = await uploadBook(request, title, { chapters: LONG_BOOK, paragraphs: 200 })

    await openReader(page, id, title)
    await waitForMeasured(page)
    await page.getByRole('button', { name: 'Contents' }).click()
    await page.getByRole('button', { name: 'Chapter 5' }).click()
    for (let turn = 0; turn < 3; turn++) {
      await page.getByRole('button', { name: 'Next page' }).click()
    }

    await expect
      .poll(async () => (await storedState(request, id)).position, { timeout: 15_000 })
      .not.toBeNull()
    const left = await storedState(request, id)

    // Leave and come back, which is what Continue Reading does.
    await page.getByRole('link', { name: 'Back' }).click()
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await openReader(page, id, title)
    await waitForMeasured(page)

    // The same page, to the percentage point.
    await expect
      .poll(async () => Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')), {
        timeout: 20_000,
      })
      .toBe(Math.round(left.progress * 100))

    // And opening the book changed nothing. This is the defect the rebuild exists for: the old
    // reader wrote where its resume landed, which walked the place down the book on every open.
    await page.waitForTimeout(2500)
    const back = await storedState(request, id)
    expect(back.position).toBe(left.position)
    expect(back.progress).toBe(left.progress)
  })

  test('the last page finishes the book', async ({ page, request }) => {
    const title = `E2E Reader Finish ${Date.now()}`
    const id = await uploadBook(request, title, { paragraphs: 6 })

    await openReader(page, id, title)
    await waitForMeasured(page)

    // Turn until the forward arrow says there is nowhere left to go. The click can lose a race
    // with the arrow being disabled by the turn before it, and losing that race is the end of
    // the book rather than a failure.
    const next = page.getByRole('button', { name: 'Next page' })
    for (let turn = 0; turn < 80; turn++) {
      if (await next.isDisabled()) break
      try {
        await next.click({ timeout: 3000 })
      } catch {
        break
      }
    }
    await expect(next).toBeDisabled()

    await expect
      .poll(async () => (await storedState(request, id)).progress, { timeout: 15_000 })
      .toBe(1)
  })
})
