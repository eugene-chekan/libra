import { expect, test } from '@playwright/test'

/**
 * The tag manager, against a real backend.
 *
 * Parallel-safe, unlike `shelves.spec.ts`: tags have no order to share, so
 * each test works on names of its own and nothing another test does can
 * disturb them. Names carry a timestamp for exactly that reason.
 *
 * **No spaces in any name here.** The server refuses them — `POST /tags`
 * answers 422 — because the search box reads `#tag` tokens and splits on
 * whitespace. One test drives that refusal on purpose.
 */
type Api = import('@playwright/test').APIRequestContext

interface ApiTag {
  id: number
  name: string
  editable: boolean
}

async function createTag(request: Api, name: string) {
  const response = await request.post('/api/tags', { data: { name } })
  expect(response.ok()).toBe(true)
  return (await response.json()) as ApiTag
}

async function tagNames(request: Api): Promise<string[]> {
  const response = await request.get('/api/tags')
  return ((await response.json()) as ApiTag[]).map((tag) => tag.name)
}

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

test.describe('tags, in a real browser', () => {
  test('a tag made in the manager appears in the sidebar', async ({ page, request }) => {
    const name = unique('e2e-made')

    await page.goto('/library')
    await page.getByRole('button', { name: 'Manage Tags' }).click()
    await page.getByLabel('New tag').fill(name)
    await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click()
    await expect(page.getByRole('dialog').getByText(name)).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    await expect(page.getByLabel('Main').getByRole('link', { name })).toBeVisible()
    expect(await tagNames(request)).toContain(name)
  })

  test('the server refuses a name with a space, and the box keeps it', async ({ page }) => {
    await page.goto('/library')
    await page.getByRole('button', { name: 'Manage Tags' }).click()
    await page.getByLabel('New tag').fill('lent out')
    await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click()

    await expect(page.getByText(/cannot contain spaces/)).toBeVisible()
    // Still there to be corrected, rather than thrown away with the error.
    await expect(page.getByLabel('New tag')).toHaveValue('lent out')
  })

  test('a tag renamed here keeps the books that were on it', async ({ page, request }) => {
    const before = unique('e2e-old')
    const after = unique('e2e-new')
    await createTag(request, before)

    await page.goto('/library')
    await page.getByRole('button', { name: 'Manage Tags' }).click()
    await page.getByRole('button', { name: `Rename ${before}` }).click()
    // Not `getByLabel('Name')`: Playwright matches a label by
    // case-insensitive substring, and every "Rename <tag>" button contains
    // "name". Asking for the textbox by its accessible name is unambiguous.
    await page.getByRole('textbox', { name: 'Name' }).fill(after)
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('dialog').getByText(after)).toBeVisible()
    const names = await tagNames(request)
    expect(names).toContain(after)
    expect(names).not.toContain(before)
  })

  test('deleting asks first, and the tag is gone afterwards', async ({ page, request }) => {
    const name = unique('e2e-doomed')
    await createTag(request, name)

    await page.goto('/library')
    await page.getByRole('button', { name: 'Manage Tags' }).click()
    await page.getByRole('button', { name: `Delete ${name}` }).click()

    // The application's own dialog, never the browser's `confirm()`.
    await expect(page.getByText(/cannot be undone/)).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page.getByRole('dialog').getByText(name)).toBeHidden()
    expect(await tagNames(request)).not.toContain(name)
  })

  test('deleting the tag being filtered by clears the filter, not just the tag', async ({
    page,
    request,
  }) => {
    const name = unique('e2e-filtered')
    const tag = await createTag(request, name)

    await page.goto(`/library?tags=${tag.id}`)
    await expect(page.getByText('Filtered by:')).toBeVisible()

    await page.getByRole('button', { name: 'Manage Tags' }).click()
    await page.getByRole('button', { name: `Delete ${name}` }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('button', { name: 'Close' }).click()

    // The grid would otherwise be filtering by a tag that no longer exists,
    // which looks exactly like an empty library.
    await expect(page).not.toHaveURL(new RegExp(`tags=${tag.id}`))
    await expect(page.getByText('Filtered by:')).toBeHidden()
  })
})
