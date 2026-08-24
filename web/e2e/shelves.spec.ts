import { expect, test } from '@playwright/test'

/**
 * The shelves page and its manager, against a real backend.
 *
 * One thing here can only be tested in a real browser: **the drag**.
 * `useDragReorder` asks the document what row is under the pointer, and jsdom
 * answers nothing, so the component suite covers the up/down buttons and this
 * file covers the mouse.
 *
 * **Serial, unlike every other spec in this suite.** Shelf *order* is one piece
 * of state shared by the whole file: `PUT /shelves/order` rewrites the entire
 * list, so two tests reordering at once would each undo the other's
 * arrangement. Everything else here is parallel-safe; the order is not.
 */
test.describe.configure({ mode: 'serial' })

type Api = import('@playwright/test').APIRequestContext
interface ApiShelf {
  id: number
  name: string
  editable: boolean
}

async function createShelf(request: Api, name: string) {
  const response = await request.post('/api/shelves', { data: { name } })
  expect(response.ok()).toBe(true)
  return (await response.json()) as ApiShelf
}

/** The reader's own shelves, in the order the server keeps them. */
async function ownShelves(request: Api): Promise<ApiShelf[]> {
  const response = await request.get('/api/shelves')
  const shelves = (await response.json()) as ApiShelf[]
  return shelves.filter((shelf) => shelf.editable)
}

/**
 * Puts `ids` at the top of the reader's shelves, leaving the rest as they are.
 *
 * The scratch database is shared and outlives the run, so a test that wants two
 * particular rows next to each other has to say so — by this point in a run
 * there are a dozen shelves from earlier tests, and its two would be scattered
 * among them.
 */
async function putFirst(request: Api, ids: number[]) {
  const all = (await ownShelves(request)).map((shelf) => shelf.id)
  const rest = all.filter((id) => !ids.includes(id))
  const response = await request.put('/api/shelves/order', {
    data: { shelf_ids: [...ids, ...rest] },
  })
  expect(response.ok()).toBe(true)
}

test.describe('shelves, in a real browser', () => {
  test('a shelf made in the manager appears on the page and in the sidebar', async ({
    page,
    request,
  }) => {
    const name = `E2E Shelf ${Date.now()}`

    await page.goto('/shelves')
    await page
      .getByRole('button', { name: /Manage Shelves|New Shelf/ })
      .first()
      .click()
    await page.getByLabel('New shelf').fill(name)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByRole('dialog').getByText(name)).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    // The same shelf, in both places that list one — scoped, because a shelf
    // name legitimately appears twice on this screen.
    await expect(page.getByRole('main').getByRole('link', { name, exact: true })).toBeVisible()
    await expect(page.getByLabel('Main').getByRole('link', { name, exact: true })).toBeVisible()
    expect((await ownShelves(request)).map((shelf) => shelf.name)).toContain(name)
  })

  test('a shelf name opens the library filtered by that shelf', async ({ page, request }) => {
    const name = `E2E Filter ${Date.now()}`
    const shelf = await createShelf(request, name)

    await page.goto('/shelves')
    await page.getByRole('main').getByRole('link', { name, exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`shelf=${shelf.id}`))
    await expect(page.getByText('Filtered by:')).toBeVisible()
  })

  test('publishing a shelf marks it, and the mark goes when it is unpublished', async ({
    page,
    request,
  }) => {
    // No "Public" in the name: the pill says exactly that word, and a name
    // containing it would match the same locator.
    const name = `E2E Visible ${Date.now()}`
    const shelf = await createShelf(request, name)
    await putFirst(request, [shelf.id])

    await page.goto('/shelves')
    await page.getByRole('button', { name: 'Manage Shelves' }).click()
    await page.getByRole('button', { name: `Edit ${name}` }).click()
    await page.getByLabel('Visible to other readers').check()
    await expect(page.getByText(/Anyone with an account can see this shelf/)).toBeVisible()
    await page.getByRole('button', { name: 'Save' }).click()

    const row = page.getByRole('listitem').filter({ hasText: name })
    await expect(row.getByText('Public', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: `Edit ${name}` }).click()
    await page.getByLabel('Visible to other readers').uncheck()
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(row.getByText('Public', { exact: true })).toBeHidden()
  })

  test('a shelf can be dragged to a new place, and the new order is stored', async ({
    page,
    request,
  }) => {
    // The one thing the component suite cannot reach: the drag asks the
    // document which row is under the pointer, which needs a real browser.
    const stamp = Date.now()
    const first = await createShelf(request, `E2E Drag A ${stamp}`)
    const second = await createShelf(request, `E2E Drag B ${stamp}`)
    // Next to each other, and at the top, so neither row needs the list
    // scrolled to reach it.
    await putFirst(request, [first.id, second.id])

    await page.goto('/shelves')
    await page.getByRole('button', { name: 'Manage Shelves' }).click()

    const firstRow = page.getByRole('listitem').filter({ hasText: first.name })
    const secondRow = page.getByRole('listitem').filter({ hasText: second.name })
    const from = await firstRow.boundingBox()
    const to = await secondRow.boundingBox()
    expect(from).not.toBeNull()
    expect(to).not.toBeNull()
    if (!from || !to) return

    // The handle is at the left edge of the row.
    await page.mouse.move(from.x + 12, from.y + from.height / 2)
    await page.mouse.down()
    // In steps, because the drag follows the pointer: one jump would arrive at
    // the target without ever passing over it.
    await page.mouse.move(to.x + 12, to.y + to.height / 2, { steps: 12 })
    await page.mouse.up()

    await expect
      .poll(async () => {
        const names = (await ownShelves(request)).map((shelf) => shelf.name)
        return names.indexOf(first.name) > names.indexOf(second.name)
      })
      .toBe(true)
  })

  test('the buttons reorder too, which is the path a keyboard has', async ({ page, request }) => {
    const stamp = Date.now()
    const first = await createShelf(request, `E2E Move A ${stamp}`)
    const second = await createShelf(request, `E2E Move B ${stamp}`)
    await putFirst(request, [first.id, second.id])

    await page.goto('/shelves')
    await page.getByRole('button', { name: 'Manage Shelves' }).click()
    await page.getByRole('button', { name: `Move ${second.name} up` }).click()

    await expect
      .poll(async () => {
        const names = (await ownShelves(request)).map((shelf) => shelf.name)
        return names.indexOf(second.name) < names.indexOf(first.name)
      })
      .toBe(true)
  })

  test('deleting asks first, and keeps the books', async ({ page, request }) => {
    const name = `E2E Delete ${Date.now()}`
    const shelf = await createShelf(request, name)

    const bookResponse = await request.post('/api/books', {
      data: {
        title: `E2E Shelved ${Date.now()}`,
        author: 'A',
        format: 'epub',
        file_path: 'x.epub',
      },
    })
    const book = (await bookResponse.json()) as { id: number }
    await request.put(`/api/books/${book.id}/state`, {
      data: { rating: 0, progress: 0, shelf_id: shelf.id },
    })
    await putFirst(request, [shelf.id])

    await page.goto('/shelves')
    await page.getByRole('button', { name: 'Manage Shelves' }).click()
    await page.getByRole('button', { name: `Delete ${name}` }).click()

    await expect(page.getByRole('dialog', { name: `Delete ${name}?` })).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect
      .poll(async () => (await ownShelves(request)).some((s) => s.name === name))
      .toBe(false)

    // The book is still in the library, just not on a shelf any more.
    const after = await request.get(`/api/books/${book.id}`)
    expect(after.ok()).toBe(true)
    expect(((await after.json()) as { shelf_id: number | null }).shelf_id).toBeNull()
  })
})
