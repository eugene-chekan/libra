import { describe, expect, it } from 'vitest'

import { ApiError } from './errors'
import { fakeBook, fakeNote, fakeShelf, fakeTag, fakeUser, FakeLibraApi } from './FakeLibraApi'

/**
 * `listBooks`/`listTags`/`listShelves` are the first fake logic complex
 * enough to earn its own test file, rather than being exercised only
 * transitively through the screens that call it. The rule this pins down —
 * from `app/library.py`'s own docstring — is that tag filters OR each other
 * and the shelf/text filters AND against that, and that an id the caller
 * cannot see is a 404, never a quietly-empty result.
 */
describe('FakeLibraApi.listBooks', () => {
  it('returns every book, sorted by title, with no filter', async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [fakeBook({ title: 'Zorba the Greek' }), fakeBook({ title: 'Anna Karenina' })],
    })

    const { items, total } = await api.listBooks()

    expect(total).toBe(2)
    expect(items.map((b) => b.title)).toEqual(['Anna Karenina', 'Zorba the Greek'])
  })

  it('matches bare words against title or author, case-insensitively', async () => {
    const user = fakeUser()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [
        fakeBook({ title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin' }),
        fakeBook({ title: 'Dune', author: 'Frank Herbert' }),
      ],
    })

    expect((await api.listBooks({ q: 'left hand' })).items).toHaveLength(1)
    expect((await api.listBooks({ q: 'HERBERT' })).items).toHaveLength(1)
    expect((await api.listBooks({ q: 'nothing matches this' })).items).toHaveLength(0)
  })

  it('ORs multiple tag ids — a book matches if it carries any one of them', async () => {
    const user = fakeUser()
    const scifi = fakeTag({ name: 'sci-fi' })
    const fantasy = fakeTag({ name: 'fantasy' })
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      tags: [scifi, fantasy],
      books: [
        fakeBook({ title: 'Dune', tag_ids: [scifi.id] }),
        fakeBook({ title: 'The Hobbit', tag_ids: [fantasy.id] }),
        fakeBook({ title: 'A Cookbook', tag_ids: [] }),
      ],
    })

    const { items } = await api.listBooks({ tagIds: [scifi.id, fantasy.id] })

    expect(items.map((b) => b.title).sort()).toEqual(['Dune', 'The Hobbit'])
  })

  it('ANDs the shelf filter against the tag filter, rather than ORing it in too', async () => {
    const user = fakeUser()
    const scifi = fakeTag({ name: 'sci-fi' })
    const shelf = fakeShelf({ owner_id: user.id })
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      tags: [scifi],
      shelves: [shelf],
      books: [
        fakeBook({ title: 'On the shelf and tagged', tag_ids: [scifi.id], shelf_id: shelf.id }),
        fakeBook({ title: 'Tagged, not shelved', tag_ids: [scifi.id], shelf_id: null }),
        fakeBook({ title: 'Shelved, not tagged', tag_ids: [], shelf_id: shelf.id }),
      ],
    })

    const { items } = await api.listBooks({ tagIds: [scifi.id], shelfId: shelf.id })

    expect(items.map((b) => b.title)).toEqual(['On the shelf and tagged'])
  })

  it('404s on a personal tag that belongs to someone else, rather than an empty result', async () => {
    const owner = fakeUser({ username: 'owner' })
    const someoneElse = fakeUser({ username: 'someone-else' })
    const privateTag = fakeTag({ owner_id: owner.id, is_global: false })
    const api = new FakeLibraApi({
      users: [owner, someoneElse],
      signedInAs: someoneElse,
      tags: [privateTag],
    })

    await expect(api.listBooks({ tagIds: [privateTag.id] })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('404s on a private shelf that belongs to someone else', async () => {
    const owner = fakeUser({ username: 'owner' })
    const someoneElse = fakeUser({ username: 'someone-else' })
    const privateShelf = fakeShelf({ owner_id: owner.id, visibility: 'private' })
    const api = new FakeLibraApi({
      users: [owner, someoneElse],
      signedInAs: someoneElse,
      shelves: [privateShelf],
    })

    await expect(api.listBooks({ shelfId: privateShelf.id })).rejects.toMatchObject({ status: 404 })
  })

  it('allows a global tag and a public shelf regardless of who owns them', async () => {
    const owner = fakeUser({ username: 'owner' })
    const someoneElse = fakeUser({ username: 'someone-else' })
    const globalTag = fakeTag({ owner_id: null, is_global: true })
    const publicShelf = fakeShelf({ owner_id: owner.id, visibility: 'public' })
    const api = new FakeLibraApi({
      users: [owner, someoneElse],
      signedInAs: someoneElse,
      tags: [globalTag],
      shelves: [publicShelf],
      books: [fakeBook({ tag_ids: [globalTag.id], shelf_id: publicShelf.id })],
    })

    await expect(api.listBooks({ tagIds: [globalTag.id] })).resolves.toMatchObject({ total: 1 })
    await expect(api.listBooks({ shelfId: publicShelf.id })).resolves.toMatchObject({ total: 1 })
  })

  it('requires a session, like every other endpoint', async () => {
    const api = new FakeLibraApi()

    await expect(api.listBooks()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('FakeLibraApi.listTags', () => {
  it("returns global tags plus the caller's own, never anyone else's personal ones", async () => {
    const caller = fakeUser({ username: 'caller' })
    const other = fakeUser({ username: 'other' })
    const api = new FakeLibraApi({
      users: [caller, other],
      signedInAs: caller,
      tags: [
        fakeTag({ name: 'global', owner_id: null }),
        fakeTag({ name: 'mine', owner_id: caller.id }),
        fakeTag({ name: 'theirs', owner_id: other.id }),
      ],
    })

    const tags = await api.listTags()

    expect(tags.map((t) => t.name).sort()).toEqual(['global', 'mine'])
  })
})

describe('FakeLibraApi.listShelves', () => {
  it("returns the caller's own shelves plus other readers' public ones", async () => {
    const caller = fakeUser({ username: 'caller' })
    const other = fakeUser({ username: 'other' })
    const api = new FakeLibraApi({
      users: [caller, other],
      signedInAs: caller,
      shelves: [
        fakeShelf({ name: 'mine', owner_id: caller.id, visibility: 'private' }),
        fakeShelf({ name: 'their public one', owner_id: other.id, visibility: 'public' }),
        fakeShelf({ name: 'their private one', owner_id: other.id, visibility: 'private' }),
      ],
    })

    const shelves = await api.listShelves()

    expect(shelves.map((s) => s.name).sort()).toEqual(['mine', 'their public one'])
  })
})

/**
 * The book detail endpoints, added in #65.
 *
 * These carry the rules the screen is built on, and every one of them is a
 * rule the client could get wrong in a way that still looks right: a PUT that
 * silently zeroes the field it was not sent, an admin-only patch, and a note
 * that belongs to somebody else.
 */
describe('FakeLibraApi.setBookState', () => {
  function signedIn(overrides: ConstructorParameters<typeof FakeLibraApi>[0] = {}) {
    const user = fakeUser({ id: 1 })
    return { user, api: new FakeLibraApi({ users: [user], signedInAs: user, ...overrides }) }
  }

  it('writes rating and progress together, because the endpoint is a PUT', async () => {
    const book = fakeBook({ rating: 4, progress: 0.5 })
    const { api } = signedIn({ books: [book] })

    // Only the rating was meant to change. The endpoint has no way to know
    // that, so a caller who leaves progress out loses it — which is exactly
    // why `BookStateWrite` makes both required.
    const updated = await api.setBookState(book.id, { rating: 5, progress: 0 })

    expect(updated.rating).toBe(5)
    expect(updated.progress).toBe(0)
  })

  it('leaves the shelf alone when shelf_id is absent, and clears it when null', async () => {
    const shelf = fakeShelf({ owner_id: 1 })
    const book = fakeBook({ shelf_id: shelf.id })
    const { api } = signedIn({ books: [book], shelves: [shelf] })

    const untouched = await api.setBookState(book.id, { rating: 0, progress: 0 })
    expect(untouched.shelf_id).toBe(shelf.id)

    const cleared = await api.setBookState(book.id, { rating: 0, progress: 0, shelf_id: null })
    expect(cleared.shelf_id).toBeNull()
  })

  it("refuses to put a book on somebody else's shelf, even a public one", async () => {
    const theirs = fakeShelf({ owner_id: 2, owner_username: 'someone', visibility: 'public' })
    const book = fakeBook()
    const { api } = signedIn({ books: [book], shelves: [theirs] })

    // Visible enough to filter the library by, and still not yours to fill.
    await expect(
      api.setBookState(book.id, { rating: 0, progress: 0, shelf_id: theirs.id })
    ).rejects.toMatchObject({ status: 403 })
    expect(book.shelf_id).toBeNull()
  })

  it('404s for a shelf the caller cannot see at all', async () => {
    const hidden = fakeShelf({ owner_id: 2, visibility: 'private' })
    const book = fakeBook()
    const { api } = signedIn({ books: [book], shelves: [hidden] })

    await expect(
      api.setBookState(book.id, { rating: 0, progress: 0, shelf_id: hidden.id })
    ).rejects.toMatchObject({ status: 404 })
  })

  it('404s for a book that is not in the library', async () => {
    const { api } = signedIn()

    await expect(api.setBookState(999, { rating: 1, progress: 0 })).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('FakeLibraApi.updateBook', () => {
  it('refuses a reader who is not an admin, because the catalog is shared', async () => {
    const reader = fakeUser({ is_admin: false })
    const book = fakeBook({ title: 'Dune' })
    const api = new FakeLibraApi({ users: [reader], signedInAs: reader, books: [book] })

    await expect(api.updateBook(book.id, { title: 'Mine now' })).rejects.toMatchObject({
      status: 403,
    })
    expect(book.title).toBe('Dune')
  })

  it('changes only the fields the patch carries, and clears one sent as null', async () => {
    const admin = fakeUser({ is_admin: true })
    const book = fakeBook({ title: 'Dune', author: 'Frank Herbert', year: 1965 })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin, books: [book] })

    const updated = await api.updateBook(book.id, { title: 'Dune (1965)', year: null })

    expect(updated.title).toBe('Dune (1965)')
    expect(updated.author).toBe('Frank Herbert')
    expect(updated.year).toBeNull()
  })

  it("keeps the caller's own reading state in the response", async () => {
    // The real endpoint did not, until #65 found it: it returned the table row
    // and let the response model fill rating and progress with defaults.
    const admin = fakeUser({ is_admin: true })
    const book = fakeBook({ rating: 5, progress: 0.5 })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin, books: [book] })

    const updated = await api.updateBook(book.id, { title: 'Corrected' })

    expect(updated.rating).toBe(5)
    expect(updated.progress).toBe(0.5)
  })
})

describe('FakeLibraApi.sendToKindle', () => {
  const book = () => fakeBook({ id: 7 })

  it('records the attempt on the book, so "Last sent" has something to read', async () => {
    const user = fakeUser({ kindle_email: 'reader@kindle.com' })
    const target = book()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [target],
      kindleSender: 'libra@example.com',
    })

    const delivery = await api.sendToKindle(target.id)

    expect(delivery.sent_to).toBe('reader@kindle.com')
    expect((await api.getBook(target.id)).last_sent_at).toBe(delivery.attempted_at)
  })

  it('422s when the reader has no Kindle address', async () => {
    const user = fakeUser({ kindle_email: null })
    const target = book()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [target],
      kindleSender: 'libra@example.com',
    })

    await expect(api.sendToKindle(target.id)).rejects.toMatchObject({ status: 422 })
  })

  it('503s when the instance has no mail configured, before it looks at the book', async () => {
    const user = fakeUser({ kindle_email: 'reader@kindle.com' })
    const api = new FakeLibraApi({ users: [user], signedInAs: user, kindleSender: null })

    // No such book either, and the 503 still wins — the endpoint checks its
    // own configuration first.
    await expect(api.sendToKindle(999)).rejects.toMatchObject({ status: 503 })
  })

  it('502s with the mail server reason when delivery fails', async () => {
    const user = fakeUser({ kindle_email: 'reader@kindle.com' })
    const target = book()
    const api = new FakeLibraApi({
      users: [user],
      signedInAs: user,
      books: [target],
      kindleSender: 'libra@example.com',
      kindleFailure: 'the mail server refused the message',
    })

    await expect(api.sendToKindle(target.id)).rejects.toMatchObject({
      status: 502,
      message: 'the mail server refused the message',
    })
    expect(target.last_sent_at).toBeNull()
  })
})

describe('FakeLibraApi notes', () => {
  it("lists only the caller's own notes on the book, newest first", async () => {
    const mine = fakeUser({ id: 1 })
    const api = new FakeLibraApi({
      users: [mine],
      signedInAs: mine,
      books: [fakeBook({ id: 1 }), fakeBook({ id: 2 })],
      notes: [
        fakeNote({ user_id: 1, book_id: 1, text: 'Older' }),
        fakeNote({ user_id: 1, book_id: 1, text: 'Newer' }),
        fakeNote({ user_id: 2, book_id: 1, text: 'Not mine' }),
        fakeNote({ user_id: 1, book_id: 2, text: 'Another book' }),
      ],
    })

    const notes = await api.listNotes(1)

    expect(notes.map((note) => note.text)).toEqual(['Newer', 'Older'])
  })

  it('adds a note and hands it back without the owner field', async () => {
    const user = fakeUser({ id: 1 })
    const api = new FakeLibraApi({ users: [user], signedInAs: user, books: [fakeBook({ id: 1 })] })

    const note = await api.createNote(1, { text: 'The reveal changes everything.', page: 156 })

    expect(note).toMatchObject({ book_id: 1, text: 'The reveal changes everything.', page: 156 })
    expect(note).not.toHaveProperty('user_id')
    expect(await api.listNotes(1)).toHaveLength(1)
  })

  it("404s rather than 403s on another reader's note, so deleting cannot probe for one", async () => {
    const mine = fakeUser({ id: 1 })
    const theirs = fakeNote({ id: 99, user_id: 2, book_id: 1 })
    const api = new FakeLibraApi({
      users: [mine],
      signedInAs: mine,
      books: [fakeBook({ id: 1 })],
      notes: [theirs],
    })

    await expect(api.deleteNote(theirs.id)).rejects.toMatchObject({ status: 404 })
    expect(api.notes).toHaveLength(1)
  })
})
