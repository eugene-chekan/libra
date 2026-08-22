import { expect, test } from '@playwright/test'

/**
 * The tests that answer issue #50.
 *
 * That issue measured the Flutter client on a running build and found the
 * whole sidebar — Library, Shelves, Librarian, Add Book — reaching a screen
 * reader as nothing at all. Roughly nine nodes existed inside Flutter and none
 * of them reached the page. It was not a labelling bug: every row carried
 * `Semantics(button: true)`. There was simply no page for the labels to
 * reach, because the app was painted onto a canvas.
 *
 * docs/specs/code-style.md draws the rule from that: "Verify accessibility
 * claims against a running build" — `flutter test` read the framework's own
 * tree, not the rendered output, and the two disagreed. A component test here
 * reads jsdom, which is closer but still not a browser. This file is the check
 * that has the final say.
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

    // The Flutter build produced a single <canvas> and nothing else. Asserting
    // the absence is worth as much as asserting the presence: it is the
    // difference this whole rewrite was for.
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('nav[aria-label="Main"] a')).toHaveCount(4)
  })

  test('the whole sidebar is reachable by keyboard alone', async ({ page }) => {
    await page.goto('/library')
    // The sidebar mounts only once the session guard resolves — a real async
    // gate now that there is a real session behind it. Tabbing before that
    // races the sidebar's first mount instead of testing tab order.
    await page.getByRole('navigation', { name: 'Main' }).waitFor()
    await page.keyboard.press('Tab')

    const reached: string[] = []
    for (let i = 0; i < 5; i++) {
      const name = await page.evaluate(() => {
        const el = document.activeElement
        return el ? (el.textContent ?? '').trim() : ''
      })
      if (name) reached.push(name)
      await page.keyboard.press('Tab')
    }

    expect(reached).toContain('Library')
    expect(reached).toContain('Shelves')
    expect(reached).toContain('Librarian')
    expect(reached).toContain('Add Book')
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
    // Issues #49 and #51: the Flutter client pulled its renderer and Roboto
    // from Google at every cold load, which made "local-first" half true. This
    // is the assertion that keeps it true.
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
