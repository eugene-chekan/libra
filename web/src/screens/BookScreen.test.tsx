import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ApiProvider } from '../api/ApiProvider'
import {
  fakeBook,
  fakeNote,
  fakeShelf,
  fakeTag,
  fakeUser,
  FakeLibraApi,
  type FakeUser,
} from '../api/FakeLibraApi'
import { createQueryClient } from '../queryClient'
import { bookPath, routes } from '../routes'
import { SessionProvider } from '../session/SessionProvider'
import { BookScreen } from './BookScreen'

/**
 * The screen, wired to the fake server through the same providers the real app
 * uses. Anything below this — one button, one panel — has its own test; what
 * this file is for is the wiring between them, and the two kinds of write the
 * screen is built around.
 */
function renderScreen(api: FakeLibraApi, path: string) {
  return render(
    <ApiProvider api={api}>
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <SessionProvider>
            <Routes>
              <Route path={routes.book} element={<BookScreen />} />
              <Route path={routes.library} element={<p>the library</p>} />
            </Routes>
          </SessionProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ApiProvider>
  )
}

type FakeOptions = NonNullable<ConstructorParameters<typeof FakeLibraApi>[0]>

function apiFor(user: FakeUser, overrides: Omit<FakeOptions, 'users' | 'signedInAs'> = {}) {
  return new FakeLibraApi({ users: [user], signedInAs: user, ...overrides })
}

const dune = () =>
  fakeBook({
    id: 4,
    title: 'Dune',
    author: 'Frank Herbert',
    format: 'epub',
    year: 1965,
    pages: 412,
    blurb: 'A desert planet, and the empire that wants it.',
  })

describe('BookScreen', () => {
  it('shows the book, its metadata line and its blurb', async () => {
    const api = apiFor(fakeUser(), { books: [dune()] })

    renderScreen(api, bookPath(4))

    expect(await screen.findByRole('heading', { name: 'Dune', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Frank Herbert')).toBeInTheDocument()
    expect(screen.getByText(/EPUB/)).toHaveTextContent('EPUB · 1965 · 412 pages')
    expect(screen.getByText(/A desert planet/)).toBeInTheDocument()
  })

  it('leaves out what the file never declared, rather than inventing it', async () => {
    const bare = fakeBook({ id: 4, title: 'Bare', format: 'epub', year: null, pages: null })
    const api = apiFor(fakeUser(), { books: [bare] })

    renderScreen(api, bookPath(4))
    await screen.findByRole('heading', { name: 'Bare', level: 1 })

    expect(screen.getByText('EPUB')).toBeInTheDocument()
  })

  it('names the shelf the book is on in the same line', async () => {
    const shelf = fakeShelf({ id: 2, name: 'Reading Now', owner_id: 1 })
    const book = fakeBook({ id: 4, title: 'Dune', shelf_id: 2 })
    const api = apiFor(fakeUser({ id: 1 }), { books: [book], shelves: [shelf] })

    renderScreen(api, bookPath(4))

    expect(await screen.findByText(/Reading Now/)).toBeInTheDocument()
  })

  it('writes a rating the moment a star is clicked, keeping progress as it was', async () => {
    const user = userEvent.setup()
    const book = fakeBook({ id: 4, title: 'Dune', progress: 0.5 })
    const api = apiFor(fakeUser(), { books: [book] })

    renderScreen(api, bookPath(4))
    await screen.findByRole('heading', { name: 'Dune', level: 1 })

    await user.click(screen.getByRole('button', { name: 'Rate 4 out of 5' }))

    // The endpoint is a PUT. Sending the rating alone would have set progress
    // back to zero — which is the whole reason both fields are required.
    await waitFor(() => expect(book.rating).toBe(4))
    expect(book.progress).toBe(0.5)
  })

  it('moves the book to a shelf, and takes it off again', async () => {
    const user = userEvent.setup()
    const shelf = fakeShelf({ id: 2, name: 'Reading Now', owner_id: 1, editable: true })
    const book = fakeBook({ id: 4, title: 'Dune' })
    const api = apiFor(fakeUser({ id: 1 }), { books: [book], shelves: [shelf] })

    renderScreen(api, bookPath(4))
    await screen.findByRole('heading', { name: 'Dune', level: 1 })

    await user.click(screen.getByRole('button', { name: /Move to Shelf/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Reading Now' }))
    await waitFor(() => expect(book.shelf_id).toBe(2))

    await user.click(screen.getByRole('button', { name: /Move to Shelf/ }))
    await user.click(await screen.findByRole('menuitem', { name: /Remove from shelf/ }))
    await waitFor(() => expect(book.shelf_id).toBeNull())
  })

  it('shows the tags on the book as filters back into the library', async () => {
    const tag = fakeTag({ id: 7, name: 'Sci-Fi', is_global: true })
    const book = fakeBook({ id: 4, title: 'Dune', tag_ids: [7] })
    const api = apiFor(fakeUser(), { books: [book], tags: [tag] })

    renderScreen(api, bookPath(4))

    const pill = await screen.findByRole('link', { name: 'Sci-Fi' })
    expect(pill).toHaveAttribute('href', '/library?tags=7')
  })

  it('offers no Edit Book to a reader who is not an admin', async () => {
    const api = apiFor(fakeUser({ is_admin: false }), { books: [dune()] })

    renderScreen(api, bookPath(4))
    await screen.findByRole('heading', { name: 'Dune', level: 1 })

    expect(screen.queryByRole('button', { name: 'Edit Book' })).not.toBeInTheDocument()
  })

  it('lets an admin correct the catalog, and shows the correction', async () => {
    const user = userEvent.setup()
    const book = dune()
    const api = apiFor(fakeUser({ is_admin: true }), { books: [book] })

    renderScreen(api, bookPath(4))
    await screen.findByRole('heading', { name: 'Dune', level: 1 })

    await user.click(screen.getByRole('button', { name: 'Edit Book' }))
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Dune (1965)')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(
      await screen.findByRole('heading', { name: 'Dune (1965)', level: 1 })
    ).toBeInTheDocument()
  })

  it('throws the edit away on Cancel', async () => {
    const user = userEvent.setup()
    const api = apiFor(fakeUser({ is_admin: true }), { books: [dune()] })

    renderScreen(api, bookPath(4))
    await screen.findByRole('heading', { name: 'Dune', level: 1 })

    await user.click(screen.getByRole('button', { name: 'Edit Book' }))
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Something else')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('heading', { name: 'Dune', level: 1 })).toBeInTheDocument()
  })

  it("shows this reader's own notes", async () => {
    const api = apiFor(fakeUser({ id: 1 }), {
      books: [dune()],
      notes: [fakeNote({ user_id: 1, book_id: 4, text: 'The reveal changes everything.' })],
    })

    renderScreen(api, bookPath(4))

    expect(await screen.findByText('The reveal changes everything.')).toBeInTheDocument()
  })

  it('sends the book to a Kindle when there is an address to send it to', async () => {
    const user = userEvent.setup()
    const api = apiFor(fakeUser({ kindle_email: 'reader@kindle.com' }), {
      books: [dune()],
      kindleSender: 'libra@example.com',
    })

    renderScreen(api, bookPath(4))
    await screen.findByRole('heading', { name: 'Dune', level: 1 })

    await user.click(screen.getByRole('button', { name: /Send to Kindle/ }))

    expect(await screen.findByRole('button', { name: /Sent/ })).toBeInTheDocument()
  })

  it('says a book is not in this library rather than showing an empty page', async () => {
    const api = apiFor(fakeUser(), { books: [] })

    renderScreen(api, bookPath(999))

    expect(await screen.findByRole('alert')).toHaveTextContent('That book is not in this library.')
    // A 404 will 404 again, so no retry is offered.
    expect(screen.queryByRole('button', { name: /Try again/ })).not.toBeInTheDocument()
  })

  it('treats a typed, non-numeric address as an address that names nothing', async () => {
    const api = apiFor(fakeUser(), { books: [dune()] })

    renderScreen(api, '/books/not-a-number')

    expect(await screen.findByText('There is nothing at this address')).toBeInTheDocument()
    // And no request was made for a book called "not-a-number".
    expect(api.calls.filter((call) => call.startsWith('getBook'))).toHaveLength(0)
  })

  it('offers the way back to the library', async () => {
    const api = apiFor(fakeUser(), { books: [dune()] })

    renderScreen(api, bookPath(4))

    expect(await screen.findByRole('link', { name: /Back to Library/ })).toHaveAttribute(
      'href',
      routes.library
    )
  })
})
