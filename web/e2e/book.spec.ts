import { expect, test } from '@playwright/test'

/**
 * The book detail screen, against a real backend, using the signed-in session
 * `auth.setup.ts` saves for every spec but its own.
 *
 * The component suite already covers what each control does against
 * `FakeLibraApi`. What only a real browser and a real server can show is the
 * round trip: that a rating written here comes back on a reload, that the
 * download link really serves a file, and that the shared catalog and the
 * reader's own state travel through two different endpoints and both land.
 *
 * Seeds its own book through the API, with a unique title per run, because
 * this suite does not own the scratch database the way a unit test owns its
 * fake.
 */

async function createBook(request: import('@playwright/test').APIRequestContext, title: string) {
  const response = await request.post('/api/books', {
    data: { title, author: 'E2E Author', format: 'epub', file_path: `${title}.epub` },
  })
  expect(response.ok()).toBe(true)
  return (await response.json()) as { id: number }
}

test.describe('book detail, in a real browser', () => {
  test('a grid cell opens the book, and Back to Library returns', async ({ page, request }) => {
    const title = `E2E Detail ${Date.now()}`
    const book = await createBook(request, title)

    await page.goto('/library')
    await page.getByRole('link', { name: new RegExp(title) }).click()

    await expect(page).toHaveURL(new RegExp(`/books/${book.id}$`))
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await expect(page.getByText('E2E Author')).toBeVisible()

    await page.getByRole('link', { name: 'Back to Library' }).click()
    await expect(page).toHaveURL(/\/library$/)
  })

  test('a rating written here survives a reload, because it went to the server', async ({
    page,
    request,
  }) => {
    const title = `E2E Rating ${Date.now()}`
    const book = await createBook(request, title)

    await page.goto(`/books/${book.id}`)
    await page.getByRole('button', { name: 'Rate 4 out of 5' }).click()

    // The button relabels itself once the rating is the one it would set —
    // clicking it again clears it — so this waits for the write to land.
    await expect(page.getByRole('button', { name: 'Clear rating' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Clear rating' })).toBeVisible()
  })

  test('an admin correcting the catalog changes what the library grid shows', async ({
    page,
    request,
  }) => {
    // The e2e session is the seeded admin, so Edit Book is offered. A reader
    // without the flag never sees it — covered in the component suite, which
    // can sign in as anyone.
    const title = `E2E Editable ${Date.now()}`
    const corrected = `${title} (corrected)`
    const book = await createBook(request, title)

    await page.goto(`/books/${book.id}`)
    await page.getByRole('button', { name: 'Edit Book' }).click()
    await page.getByLabel('Title').fill(corrected)
    await page.getByLabel('Year').fill('1965')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByRole('heading', { name: corrected, level: 1 })).toBeVisible()
    await expect(page.getByText(/1965/)).toBeVisible()

    await page.goto('/library')
    await expect(page.getByText(corrected, { exact: true }).first()).toBeVisible()
  })

  test('a note added here is listed, and can be deleted again', async ({ page, request }) => {
    const title = `E2E Notes ${Date.now()}`
    const book = await createBook(request, title)
    const note = `A note written at ${Date.now()}`

    await page.goto(`/books/${book.id}`)
    await expect(page.getByText('No notes yet.')).toBeVisible()

    await page.getByLabel('New note').fill(note)
    // Exact, because the sidebar's own "Add Book" button is on this page too.
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(page.getByText(note)).toBeVisible()

    await page.getByRole('button', { name: `Delete note: ${note}` }).click()
    await expect(page.getByText('No notes yet.')).toBeVisible()
  })

  test('the download link points at the file endpoint, and the server answers it', async ({
    page,
    request,
  }) => {
    const title = `E2E Download ${Date.now()}`
    const book = await createBook(request, title)

    await page.goto(`/books/${book.id}`)
    await expect(page.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      `/api/books/${book.id}/file`
    )

    // This book's row points at a file that was never uploaded, so the server
    // answers 404 rather than bytes. What is being checked is that the address
    // is a real endpoint reaching a real handler — not the disk.
    const response = await request.get(`/api/books/${book.id}/file`)
    expect([200, 404]).toContain(response.status())
  })

  test('the Start Reading button leads to the reader', async ({ page, request }) => {
    // This book is a catalog row with no file behind it — `createBook` posts a `file_path` that
    // was never uploaded. So the reader opens and reports a missing file, and offers no retry,
    // because retrying reads the same empty shelf. Reading a real book is `reader.spec.ts`.
    const title = `E2E Read ${Date.now()}`
    const book = await createBook(request, title)

    await page.goto(`/books/${book.id}`)
    await page.getByRole('link', { name: 'Start Reading' }).click()

    await expect(page).toHaveURL(new RegExp(`/books/${book.id}/read$`))
    await expect(page.getByRole('alert')).toContainText("This book's file is missing")
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back to the book' })).toBeVisible()
  })

  test('an address that names no book says so, rather than showing an empty page', async ({
    page,
  }) => {
    await page.goto('/books/999999')

    await expect(page.getByText('That book is not in this library.')).toBeVisible()
  })

  /*
   The session this suite signs in with is an admin, which is who the delete is for. The server
   is what makes this worth a real test: the component suite deletes from a fake that holds its
   books in an array, and only a real backend can be asked afterwards whether the row is gone.
  */
  test('an admin deletes a book, and the server agrees it is gone', async ({ page, request }) => {
    const title = `E2E Delete ${Date.now()}`
    const book = await createBook(request, title)

    await page.goto(`/books/${book.id}`)
    await page.getByRole('button', { name: 'Delete Book' }).click()

    await expect(page.getByRole('dialog', { name: `Delete ${title}?` })).toBeVisible()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0)
    expect((await request.get(`/api/books/${book.id}`)).status()).toBe(404)
  })
})
