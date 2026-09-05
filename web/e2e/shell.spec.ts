import { expect, test } from '@playwright/test'

/**
 * Verifies the sidebar reaches a real accessibility tree in a real browser.
 *
 * A component test here reads jsdom, which is closer than a framework's own
 * semantics tree but still not a browser. This file is the check that has
 * the final say — see "Verify accessibility claims against a build" in
 * docs/specs/code-style.md.
 */

test.describe('the app frame, in a real browser', () => {
  test('every sidebar row is in the accessibility tree', async ({ page }) => {
    await page.goto('/library')

    // The exact rows issue #50 found missing.
    await expect(page.getByRole('link', { name: 'Library' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Shelves' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Librarian' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Book' })).toBeVisible()
  })

  test('the sidebar renders DOM elements, not pixels on a canvas', async ({ page }) => {
    await page.goto('/library')

    // Asserting the absence of a canvas is worth as much as asserting the
    // presence of real elements: a canvas-painted UI would pass a naive
    // element-count check while giving screen readers nothing to read.
    //
    // At least 3, not exactly 3: the logo plus the two primary nav link rows
    // (Library, Shelves — Librarian is a button, not a link, since it opens
    // the panel rather than navigating) are always there, but SHELVES and
    // TAGS add more real anchors as the scratch database accumulates them
    // across a whole `playwright test` run — this only needs to prove those
    // are real elements too, not pin how many exist right now.
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect
      .poll(() => page.locator('nav[aria-label="Main"] a').count())
      .toBeGreaterThanOrEqual(3)
  })

  test('the whole sidebar is reachable by keyboard alone', async ({ page }) => {
    await page.goto('/library')
    // The sidebar mounts only once the session guard resolves — a real async
    // gate now that there is a real session behind it. Tabbing before that
    // races the sidebar's first mount instead of testing tab order.
    await page.getByRole('navigation', { name: 'Main' }).waitFor()
    await page.keyboard.press('Tab')

    // **The loop stops when it has found what it came for, not after a set
    // number of tabs.** The sidebar's rows grow with the library — one per
    // shelf, one per tag, plus the two Manage rows — and other specs in this
    // suite are creating shelves and tags while this one walks. A fixed 15
    // was enough until they were not, and counting the rows once at the start
    // goes stale the moment another spec adds one. The 200 is only a runaway
    // guard: reaching it means a row really is unreachable, and the
    // assertions below say which.
    const wanted = ['Library', 'Shelves', 'Librarian', 'Add Book']
    const reached: string[] = []

    for (let i = 0; i < 200 && !wanted.every((row) => reached.includes(row)); i++) {
      const name = await page.evaluate(() => {
        const el = document.activeElement
        return el ? (el.textContent ?? '').trim() : ''
      })
      if (name) reached.push(name)
      await page.keyboard.press('Tab')
    }

    // Only the four that must always be reachable, wherever they land in a
    // longer sequence.
    for (const row of wanted) expect(reached).toContain(row)
  })

  test('Enter on a focused nav row navigates', async ({ page }) => {
    await page.goto('/library')

    await page.getByRole('link', { name: 'Shelves' }).focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/shelves$/)
    await expect(page.getByRole('heading', { name: 'Shelves' })).toBeVisible()
  })

  test('a focused row shows a visible focus ring', async ({ page }) => {
    // client-design.md specifies 2px accent at 2px offset, and says why: the
    // handoff left it to the browser default and a keyboard user needs it.
    await page.goto('/library')
    await page.getByRole('link', { name: 'Shelves' }).focus()

    const outline = await page
      .getByRole('link', { name: 'Shelves' })
      .evaluate((el) => getComputedStyle(el).outlineWidth)

    expect(outline).toBe('2px')
  })

  test('the current page is announced, not only coloured', async ({ page }) => {
    await page.goto('/shelves')

    await expect(page.getByRole('link', { name: 'Shelves' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    await expect(page.getByRole('link', { name: 'Library' })).not.toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  test('the fonts are served by this instance and nothing is fetched from Google', async ({
    page,
  }) => {
    // Fonts are bundled and served by this instance. This is the assertion
    // that keeps "local-first" true rather than aspirational.
    const offSite: string[] = []
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') offSite.push(request.url())
    })

    await page.goto('/library')
    await page.waitForLoadState('networkidle')

    expect(offSite).toEqual([])
  })

  test('a reload deep in the app still returns the app', async ({ page }) => {
    // The whole reason the API moved under /api. With real-path routing, a
    // reload at /shelves asks the server for /shelves — and before the prefix
    // that was the endpoint returning JSON.
    await page.goto('/shelves')
    await page.reload()

    await expect(page.getByRole('heading', { name: 'Shelves' })).toBeVisible()
  })

  test('an address that means nothing shows the not-found screen, with a way out', async ({
    page,
  }) => {
    await page.goto('/no-such-page')

    await expect(page.getByRole('heading', { name: 'Not found' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to the library' }).click()
    await expect(page).toHaveURL(/\/library$/)
  })

  /*
   Two halves the component suite cannot reach. jsdom has no layout, so it cannot say the sidebar
   got narrower or that a label stopped being drawn — the class that hides one works by clipping,
   which jsdom reports as visible. And the choice is kept in localStorage, which only survives a
   real reload in a real browser.
  */
  test('the sidebar collapses to icons, and is still collapsed after a reload', async ({
    page,
  }) => {
    await page.goto('/library')
    const sidebar = page.getByLabel('Main')
    // Polled, not read once: the width is animated, so the first answer after a click is a
    // number somewhere in the middle of the change.
    const width = async () => (await sidebar.boundingBox())?.width ?? 0
    const wide = await width()

    // Asked of the page rather than written here, so the token stays the one place the number
    // lives. Polled, because the width is animated and settles a moment after the click.
    const narrow = await page.evaluate(() =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--libra-sidebar-collapsed-width'
        )
      )
    )
    expect(narrow).toBeLessThan(wide)

    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect.poll(width).toBe(narrow)

    // Still named for a screen reader, no longer drawn for the eye.
    const addBook = page.getByRole('button', { name: 'Add Book' })
    await expect(addBook).toBeVisible()
    expect((await addBook.boundingBox())?.width ?? 0).toBeLessThan(narrow)

    await page.reload()

    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    expect(await width()).toBe(narrow)
  })

  /*
   Librarian opens a panel rather than going anywhere, so it is a button while the rows around it
   are links — and a button arrives wearing the browser's own border, grey fill and arrow cursor,
   which an anchor does not. jsdom applies none of that, so only a real browser can see the row
   standing out of the list it belongs to. Compared against its neighbour rather than against
   fixed values, because what matters is that the four rows match, not what they measure.
  */
  test('the Librarian row is drawn like the rows around it', async ({ page }) => {
    await page.goto('/library')

    const nav = page.getByLabel('Main')
    const look = (locator: ReturnType<typeof nav.getByRole>) =>
      locator.evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          borderWidth: style.borderTopWidth,
          background: style.backgroundColor,
          cursor: style.cursor,
          height: Math.round(el.getBoundingClientRect().height),
        }
      })

    const librarian = await look(nav.getByRole('button', { name: 'Librarian' }))
    const shelves = await look(nav.getByRole('link', { name: 'Shelves' }))

    expect(librarian).toEqual(shelves)
  })

  /*
   Read from the server rather than written here, because a number typed into a
   test is a number that stops being true the day somebody bumps it. What this
   proves is that the two agree — and that `/health` reaches the backend at all,
   which it only does through the extra proxy line in `vite.config.ts`.
  */
  test('the sidebar names the build that is serving', async ({ page, request }) => {
    const response = await request.get('/health')
    expect(response.ok()).toBe(true)
    const health = (await response.json()) as { version: string; build?: string }

    await page.goto('/library')

    const expected = health.build
      ? `libra ${health.version} · ${health.build}`
      : `libra ${health.version}`
    await expect(page.getByText(expected)).toBeVisible()
  })
})
