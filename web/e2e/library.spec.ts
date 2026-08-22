import { expect, test } from '@playwright/test'

/**
 * The library grid, search, and filters — against a real backend, using the
 * signed-in session `auth.setup.ts` saves for every spec but its own.
 *
 * Seeds its own book and tag through the API rather than the (not yet
 * built) upload screen, with a unique title per run so this spec's
 * assertions hold regardless of what earlier test runs left in the shared
 * scratch database — this suite does not own the backend the way a unit
 * test owns `FakeLibraApi`.
 */

async function createBook(request: import('@playwright/test').APIRequestContext, title: string) {
  const response = await request.post('/api/books', {
    data: { title, author: 'E2E Author', format: 'epub', file_path: `${title}.epub` },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as { id: number }
}

test.describe('library grid, search, and filters, in a real browser', () => {
  test('a newly created book shows up in the grid, and search finds it by title', async ({
    page,
    request,
  }) => {
    const title = `E2E Dune ${Date.now()}`
    await createBook(request, title)

    await page.goto('/library')
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()

    await page.getByRole('textbox').fill('there is no book called this')
    await expect(page.getByText('No books match your search.')).toBeVisible()

    await page.getByRole('textbox').fill(title)
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
  })

  test('a personal tag filters the grid, from the sidebar and from a typed #token alike', async ({
    page,
    request,
  }) => {
    const title = `E2E Piranesi ${Date.now()}`
    const tagName = `e2e-tag-${Date.now()}`
    const book = await createBook(request, title)

    const tagResponse = await request.post('/api/tags', { data: { name: tagName } })
    expect(tagResponse.ok()).toBe(true)
    const tag = (await tagResponse.json()) as { id: number }

    const stateResponse = await request.put(`/api/books/${book.id}/state`, {
      data: { rating: 0, progress: 0, tag_ids: [tag.id] },
    })
    expect(stateResponse.ok()).toBe(true)

    await page.goto('/library')
    await page.getByRole('link', { name: tagName }).click()

    await expect(page).toHaveURL(new RegExp(`tags=${tag.id}`))
    await expect(page.getByText('Filtered by:')).toBeVisible()
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()

    // The same filter, reached by typing the tag instead of clicking it.
    await page.goto('/library')
    await page.getByRole('textbox').fill(`#${tagName}`)
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
  })
})
