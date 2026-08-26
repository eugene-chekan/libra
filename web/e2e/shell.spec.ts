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
    await expect(page.getByRole('link', { name: 'Librarian' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add Book' })).toBeVisible()
  })

  test('the sidebar renders DOM elements, not pixels on a canvas', async ({ page }) => {
    await page.goto('/library')

    // Asserting the absence of a canvas is worth as much as asserting the
    // presence of real elements: a canvas-painted UI would pass a naive
    // element-count check while giving screen readers nothing to read.
    //
    // At least 4, not exactly 4: the logo plus the three primary nav rows
    // are always there, but SHELVES and TAGS add more real anchors as the
    // scratch database accumulates them across a whole `playwright test`
    // run — this only needs to prove those are real elements too, not pin
    // how many exist right now.
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect
      .poll(() => page.locator('nav[aria-label="Main"] a').count())
      .toBeGreaterThanOrEqual(4)
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
})
