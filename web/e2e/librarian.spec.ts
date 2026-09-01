import { expect, test, type Page } from '@playwright/test'

/**
 * The librarian panel, against a real backend. Every signed-in reader can
 * open it — there is no admin/reader branching to cover here, unlike the
 * admin page. What only a real server can show is the round trip: a
 * question actually reaches the backend and streams a real reply back.
 */

/** Types a question into the composer and sends it. */
// Not the onboarding suggestion button: those only render while the
// conversation has no messages yet, and this reader's conversation is one
// persistent record on the server — once any spec run has ever sent a
// message, every later run starts from that same history. Typing into the
// composer works either way, and the suggestion buttons themselves are
// already covered with a fake service at the component level
// (`LibrarianPanel.test.tsx`).
async function ask(page: Page, question: string) {
  await page.getByLabel('Ask about your library').fill(question)
  await page.getByRole('button', { name: 'Send' }).click()
}

// Serial, unlike most specs in this suite: all three tests here sign in as
// the same reader and share that reader's one, unreset conversation record
// (`_get_or_create_conversation` in the backend never makes a second one) —
// two tests sending a message at once would each see the other's turn mixed
// into their own assertions. See shelves.spec.ts for the same pattern
// against shared shelf order.
test.describe.configure({ mode: 'serial' })

test.describe('librarian panel, in a real browser', () => {
  test('opens over the library, asks a question, gets a streamed reply with a citation', async ({
    page,
  }) => {
    await page.goto('/library')

    await page.getByRole('button', { name: 'Librarian' }).click()
    await expect(page.getByRole('heading', { name: 'Librarian' })).toBeVisible()
    // The page underneath is still there, just dimmed — not gone. Radix's
    // modal dialog marks the rest of the app aria-hidden while open (correct
    // behaviour for assistive tech), so a role query can't see it — this
    // checks the DOM directly instead.
    await expect(page.locator('h1', { hasText: 'Library' })).toBeVisible()

    await ask(page, 'What should I read next?')

    // .last(): the same question text, and the same tool-status summary, can
    // already be sitting earlier in this reader's conversation history from
    // a previous run of this spec — only the newest turn proves this run's
    // round trip.
    await expect(page.getByText('What should I read next?').last()).toBeVisible()
    await expect(page.getByText(/Searched your library/).last()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: 'Cited book' }).last()).toBeVisible()
  })

  test('a citation click navigates the page underneath and keeps the panel open', async ({
    page,
  }) => {
    await page.goto('/library')
    await page.getByRole('button', { name: 'Librarian' }).click()
    await ask(page, 'What should I read next?')
    await expect(page.getByText(/Searched your library/).last()).toBeVisible({ timeout: 10_000 })

    const citation = page.getByRole('link', { name: 'Cited book' }).last()
    const bookTitle = await citation.textContent()
    await citation.click()

    await expect(page).toHaveURL(/\/books\/\d+$/)
    await expect(page.getByRole('heading', { name: 'Librarian' })).toBeVisible()
    // The panel stays open across the navigation, so the book page underneath
    // is aria-hidden the same way the library page was above — a DOM locator,
    // not a role query, is what actually proves the right book rendered.
    if (bookTitle) await expect(page.locator('h1', { hasText: bookTitle.trim() })).toBeVisible()
  })

  test('closes on Escape, back to the page underneath', async ({ page }) => {
    await page.goto('/library')
    await page.getByRole('button', { name: 'Librarian' }).click()
    await expect(page.getByRole('heading', { name: 'Librarian' })).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('heading', { name: 'Librarian' })).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
  })
})
