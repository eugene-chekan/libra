import { describe, expect, it } from 'vitest'

import { ApiError } from './errors'
import {
  fakeBook,
  fakeNote,
  fakeShelf,
  fakeTag,
  fakeUser,
  FakeLibraApi,
  type FakeBook,
} from './FakeLibraApi'
import type { Shelf, Tag } from './types'

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

/**
 * Uploading, added for milestone 8 (#30). The real endpoint derives every
 * field from the file itself; the fake cannot parse EPUB bytes, so tests
 * steer what "parsing" returns through `uploadMetadata`, the same way
 * `kindleFailure` steers a delivery the fake cannot organically produce.
 */
describe('FakeLibraApi.uploadBook', () => {
  function signedIn(overrides: ConstructorParameters<typeof FakeLibraApi>[0] = {}) {
    const user = fakeUser({ id: 1 })
    return { user, api: new FakeLibraApi({ users: [user], signedInAs: user, ...overrides }) }
  }

  it('adds a book from the uploaded file, and it shows up in the library', async () => {
    const { api } = signedIn()
    const file = new File(['epub bytes'], 'dune.epub', { type: 'application/epub+zip' })

    const created = await api.uploadBook(file)

    expect(created.title).toBe('dune')
    expect((await api.listBooks()).items.map((b) => b.id)).toContain(created.id)
  })

  it('uses the metadata a test configures, the way a parsed EPUB would answer', async () => {
    const { api } = signedIn({
      uploadMetadata: { title: 'Dune', author: 'Frank Herbert', year: 1965 },
    })
    const file = new File(['epub bytes'], 'upload.epub')

    const created = await api.uploadBook(file)

    expect(created).toMatchObject({ title: 'Dune', author: 'Frank Herbert', year: 1965 })
  })

  it('415s a file that is not an EPUB, without looking at its content', async () => {
    const { api } = signedIn()
    const file = new File(['not an epub'], 'notes.pdf')

    await expect(api.uploadBook(file)).rejects.toMatchObject({ status: 415 })
  })

  it('raises whatever failure a test configures, for the errors the fake cannot produce on its own', async () => {
    const { api } = signedIn({
      uploadFailure: { status: 422, detail: 'Invalid EPUB: bad mimetype' },
    })
    const file = new File(['garbage'], 'broken.epub')

    await expect(api.uploadBook(file)).rejects.toMatchObject({
      status: 422,
      message: 'Invalid EPUB: bad mimetype',
    })
  })

  it('requires a session, like every other endpoint', async () => {
    const api = new FakeLibraApi()

    await expect(api.uploadBook(new File(['x'], 'x.epub'))).rejects.toBeInstanceOf(ApiError)
  })
})

/**
 * User administration, added for milestone 9 (#31). `listUsers` and
 * `createUser` are admin-only the same way tag/shelf writes already are;
 * `deleteUser` refuses the caller's own id before anything else, mirroring
 * `library.delete_user`'s own check order.
 */
describe('FakeLibraApi.listUsers', () => {
  it('lists every user, for an admin', async () => {
    const admin = fakeUser({ id: 1, username: 'admin', is_admin: true })
    const reader = fakeUser({ id: 2, username: 'reader' })
    const api = new FakeLibraApi({ users: [admin, reader], signedInAs: admin })

    const users = await api.listUsers()

    expect(users.map((u) => u.username)).toEqual(['admin', 'reader'])
  })

  it('403s a reader who is not an admin', async () => {
    const reader = fakeUser({ is_admin: false })
    const api = new FakeLibraApi({ users: [reader], signedInAs: reader })

    await expect(api.listUsers()).rejects.toMatchObject({ status: 403 })
  })
})

describe('FakeLibraApi.createUser', () => {
  it('creates an account, normalising the username', async () => {
    const admin = fakeUser({ is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })

    const created = await api.createUser({ username: '  New.Reader  ', password: 'x' })

    expect(created).toMatchObject({ username: 'new.reader', is_admin: false })
  })

  it('403s a reader who is not an admin', async () => {
    const reader = fakeUser({ is_admin: false })
    const api = new FakeLibraApi({ users: [reader], signedInAs: reader })

    await expect(api.createUser({ username: 'x', password: 'x' })).rejects.toMatchObject({
      status: 403,
    })
  })

  it('refuses a taken username', async () => {
    const admin = fakeUser({ is_admin: true, username: 'taken' })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })

    await expect(api.createUser({ username: 'taken', password: 'x' })).rejects.toMatchObject({
      status: 409,
    })
  })

  it('refuses a blank username or password', async () => {
    const admin = fakeUser({ is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })

    await expect(api.createUser({ username: '   ', password: 'x' })).rejects.toMatchObject({
      status: 422,
    })
    await expect(api.createUser({ username: 'ok', password: '' })).rejects.toMatchObject({
      status: 422,
    })
  })
})

describe('FakeLibraApi.updateUser', () => {
  it('409s when an admin clears their own admin status', async () => {
    const admin = fakeUser({ id: 1, is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })

    await expect(api.updateUser(1, { is_admin: false })).rejects.toMatchObject({ status: 409 })
  })

  it("clears another admin's status", async () => {
    const admin = fakeUser({ id: 1, is_admin: true })
    const other = fakeUser({ id: 2, is_admin: true })
    const api = new FakeLibraApi({ users: [admin, other], signedInAs: admin })

    expect(await api.updateUser(2, { is_admin: false })).toMatchObject({ is_admin: false })
  })

  it('lets an admin send their own flag back unchanged', async () => {
    const admin = fakeUser({ id: 1, is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })

    expect(await api.updateUser(1, { is_admin: true })).toMatchObject({ is_admin: true })
  })
})

describe('FakeLibraApi.deleteUser', () => {
  it('removes the account', async () => {
    const admin = fakeUser({ id: 1, is_admin: true })
    const target = fakeUser({ id: 2 })
    const api = new FakeLibraApi({ users: [admin, target], signedInAs: admin })

    await api.deleteUser(2)

    expect((await api.listUsers()).map((u) => u.id)).toEqual([1])
  })

  it('403s a reader who is not an admin', async () => {
    const reader = fakeUser({ id: 1, is_admin: false })
    const target = fakeUser({ id: 2 })
    const api = new FakeLibraApi({ users: [reader, target], signedInAs: reader })

    await expect(api.deleteUser(2)).rejects.toMatchObject({ status: 403 })
  })

  it('404s for a user that does not exist', async () => {
    const admin = fakeUser({ id: 1, is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })

    await expect(api.deleteUser(999)).rejects.toMatchObject({ status: 404 })
  })

  it("409s on the caller's own id, before anything else", async () => {
    const admin = fakeUser({ id: 1, is_admin: true })
    const api = new FakeLibraApi({ users: [admin], signedInAs: admin })

    await expect(api.deleteUser(1)).rejects.toMatchObject({ status: 409 })
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

/**
 * Writing shelves, added in #68.
 *
 * Every rule here is one the client could get wrong in a way that still looks
 * right on screen: a name that differs only by case, a shelf that is visible
 * but not yours, an order that is one id short.
 */
describe('FakeLibraApi shelf writes', () => {
  function signedIn(shelves: Shelf[] = [], books: FakeBook[] = []) {
    const user = fakeUser({ id: 1, username: 'reader1' })
    return { user, api: new FakeLibraApi({ users: [user], signedInAs: user, shelves, books }) }
  }

  it('adds a new shelf at the end of the order, not the top', async () => {
    const { api } = signedIn([fakeShelf({ id: 1, owner_id: 1, name: 'First' })])

    await api.createShelf({ name: 'Second' })

    expect((await api.listShelves()).map((shelf) => shelf.name)).toEqual(['First', 'Second'])
  })

  it('refuses a name the reader already used, ignoring case', async () => {
    // The server's uniqueness index is COLLATE NOCASE, so one reader cannot
    // hold both "To Read" and "to read".
    const { api } = signedIn([fakeShelf({ id: 1, owner_id: 1, name: 'To Read' })])

    await expect(api.createShelf({ name: 'to read' })).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a blank name', async () => {
    const { api } = signedIn()

    await expect(api.createShelf({ name: '   ' })).rejects.toMatchObject({ status: 422 })
  })

  it('renames without moving any books, because a book holds the shelf id', async () => {
    const shelf = fakeShelf({ id: 1, owner_id: 1, name: 'Old' })
    const book = fakeBook({ shelf_id: 1 })
    const { api } = signedIn([shelf], [book])

    const renamed = await api.updateShelf(1, { name: 'New' })

    expect(renamed.name).toBe('New')
    expect(book.shelf_id).toBe(1)
  })

  it('publishes and unpublishes a shelf', async () => {
    const { api } = signedIn([fakeShelf({ id: 1, owner_id: 1, visibility: 'private' })])

    expect((await api.updateShelf(1, { visibility: 'public' })).visibility).toBe('public')
    expect((await api.updateShelf(1, { visibility: 'private' })).visibility).toBe('private')
  })

  it("403s on somebody else's public shelf, and 404s on one that cannot be seen", async () => {
    // The two answers are different on purpose. A 403 for an invisible shelf
    // would confirm it exists, which is enough to walk ids and enumerate
    // another reader's private shelves.
    const theirPublic = fakeShelf({ id: 2, owner_id: 2, visibility: 'public' })
    const theirPrivate = fakeShelf({ id: 3, owner_id: 2, visibility: 'private' })
    const { api } = signedIn([theirPublic, theirPrivate])

    await expect(api.updateShelf(2, { name: 'Mine now' })).rejects.toMatchObject({ status: 403 })
    await expect(api.updateShelf(3, { name: 'Mine now' })).rejects.toMatchObject({ status: 404 })
    await expect(api.deleteShelf(2)).rejects.toMatchObject({ status: 403 })
  })

  it('leaves the books unshelved when their shelf is deleted', async () => {
    // They stay in the library. Moving them somewhere nobody chose would be
    // worse than leaving them loose.
    const shelf = fakeShelf({ id: 1, owner_id: 1 })
    const book = fakeBook({ shelf_id: 1 })
    const { api } = signedIn([shelf], [book])

    await api.deleteShelf(1)

    expect(book.shelf_id).toBeNull()
    expect(await api.listShelves()).toHaveLength(0)
  })

  it('rewrites the whole order from the list it is given', async () => {
    const { api } = signedIn([
      fakeShelf({ id: 1, owner_id: 1, name: 'A' }),
      fakeShelf({ id: 2, owner_id: 1, name: 'B' }),
      fakeShelf({ id: 3, owner_id: 1, name: 'C' }),
    ])

    const reordered = await api.reorderShelves([3, 1, 2])

    expect(reordered.map((shelf) => shelf.name)).toEqual(['C', 'A', 'B'])
    expect((await api.listShelves()).map((shelf) => shelf.name)).toEqual(['C', 'A', 'B'])
  })

  it('refuses an order that is not exactly the reader’s own shelves', async () => {
    const mine = fakeShelf({ id: 1, owner_id: 1 })
    const theirs = fakeShelf({ id: 2, owner_id: 2, visibility: 'public' })
    const { api } = signedIn([mine, theirs])

    // One short, one repeated, and one that belongs to somebody else — a
    // stale client in the first two cases, and an attempt to order another
    // reader's shelf in the third.
    await expect(api.reorderShelves([])).rejects.toMatchObject({ status: 422 })
    await expect(api.reorderShelves([1, 1])).rejects.toMatchObject({ status: 422 })
    await expect(api.reorderShelves([1, 2])).rejects.toMatchObject({ status: 422 })
  })

  it('lists the caller’s own shelves first, then other readers’ public ones', async () => {
    const { api } = signedIn([
      fakeShelf({ id: 2, owner_id: 2, owner_username: 'someone', visibility: 'public' }),
      fakeShelf({ id: 1, owner_id: 1, name: 'Mine' }),
    ])

    const shelves = await api.listShelves()

    expect(shelves.map((shelf) => shelf.id)).toEqual([1, 2])
    expect(shelves.map((shelf) => shelf.editable)).toEqual([true, false])
  })

  it('answers editable from who is asking, not from what the test seeded', async () => {
    // Otherwise a test could hand itself an editable shelf belonging to
    // somebody else, and every ownership rule above would pass by accident.
    const { api } = signedIn([
      fakeShelf({ id: 2, owner_id: 2, visibility: 'public', editable: true }),
    ])

    expect((await api.listShelves())[0]?.editable).toBe(false)
  })
})

/**
 * Tag writes. The rules here are the ones a screen could otherwise get wrong
 * and never find out: a name with a space in it, a personal tag shadowing a
 * global one, and a global tag an ordinary reader may not touch at all.
 */
describe('FakeLibraApi tag writes', () => {
  function signedIn(tags: Tag[] = [], books: FakeBook[] = [], isAdmin = false) {
    const user = fakeUser({ id: 1, username: 'reader1', is_admin: isAdmin })
    return { user, api: new FakeLibraApi({ users: [user], signedInAs: user, tags, books }) }
  }

  it('creates a personal tag, never a global one', async () => {
    const { api } = signedIn()

    const created = await api.createTag({ name: 'favourites' })

    expect(created).toMatchObject({ name: 'favourites', is_global: false, editable: true })
    expect(created.owner_id).toBe(1)
  })

  it('403s a reader asking for a global tag, before it looks at the name', async () => {
    // The order matters: whether this caller may mint shared vocabulary does
    // not depend on what they wanted to call it.
    const { api } = signedIn()

    await expect(api.createTag({ name: 'lent out' }, true)).rejects.toMatchObject({ status: 403 })
  })

  it('lets an admin create a global tag, owned by nobody', async () => {
    const { api } = signedIn([], [], true)

    const created = await api.createTag({ name: 'sci-fi' }, true)

    expect(created).toMatchObject({ name: 'sci-fi', is_global: true, editable: true })
    expect(created.owner_id).toBeNull()
  })

  it('refuses a global name another global already holds', async () => {
    const { api } = signedIn([fakeTag({ id: 1, name: 'Sci-Fi' })], [], true)

    await expect(api.createTag({ name: 'sci-fi' }, true)).rejects.toMatchObject({ status: 409 })
  })

  it('lets a global tag take a name a reader holds privately', async () => {
    // No clash to report: the personal one is that reader's own, and the
    // uniqueness rules are per owner. The server allows it, so the fake must.
    const { api } = signedIn(
      [fakeTag({ id: 1, owner_id: 1, is_global: false, name: 'beach' })],
      [],
      true
    )

    await expect(api.createTag({ name: 'beach' }, true)).resolves.toMatchObject({ is_global: true })
  })

  it('refuses a name with a space, because the search box splits on whitespace', async () => {
    const { api } = signedIn()

    await expect(api.createTag({ name: 'lent out' })).rejects.toMatchObject({ status: 422 })
    await expect(api.createTag({ name: 'lent-out' })).resolves.toMatchObject({ name: 'lent-out' })
  })

  it('refuses a blank name', async () => {
    const { api } = signedIn()

    await expect(api.createTag({ name: '   ' })).rejects.toMatchObject({ status: 422 })
  })

  it('refuses a name the reader already used, ignoring case', async () => {
    const { api } = signedIn([fakeTag({ id: 1, owner_id: 1, is_global: false, name: 'Beach' })])

    await expect(api.createTag({ name: 'beach' })).rejects.toMatchObject({ status: 409 })
  })

  it('refuses a personal tag that would shadow a global one', async () => {
    // Two rows reading the same in one sidebar is a bug from the reader's
    // side, whatever the indexes permit.
    const { api } = signedIn([fakeTag({ id: 1, name: 'Sci-Fi' })])

    await expect(api.createTag({ name: 'sci-fi' })).rejects.toMatchObject({ status: 409 })
  })

  it('renames without moving any books, because a book holds the tag id', async () => {
    const { api } = signedIn(
      [fakeTag({ id: 1, owner_id: 1, is_global: false, name: 'Old' })],
      [fakeBook({ id: 5, tag_ids: [1] })]
    )

    await api.updateTag(1, { name: 'New' })

    expect((await api.listTags())[0]?.name).toBe('New')
    expect((await api.getBook(5)).tag_ids).toEqual([1])
  })

  it('403s on a global tag for an ordinary reader, and allows it for an admin', async () => {
    const { api } = signedIn([fakeTag({ id: 1, name: 'Sci-Fi' })])
    await expect(api.updateTag(1, { name: 'Science' })).rejects.toMatchObject({ status: 403 })
    await expect(api.deleteTag(1)).rejects.toMatchObject({ status: 403 })

    const { api: adminApi } = signedIn([fakeTag({ id: 1, name: 'Sci-Fi' })], [], true)
    await expect(adminApi.updateTag(1, { name: 'Science' })).resolves.toMatchObject({
      name: 'Science',
    })
  })

  it("404s rather than 403s on another reader's tag, so ids cannot be walked", async () => {
    const { api } = signedIn([fakeTag({ id: 1, owner_id: 2, is_global: false, name: 'Theirs' })])

    await expect(api.updateTag(1, { name: 'Mine' })).rejects.toMatchObject({ status: 404 })
    await expect(api.deleteTag(1)).rejects.toMatchObject({ status: 404 })
  })

  it('lets an admin put a global tag on a book, and a reader not', async () => {
    // Curating a shared vocabulary means being able to use it. The server
    // refused everybody until this, so the fake refused everybody too.
    const { api: adminApi } = signedIn(
      [fakeTag({ id: 1, name: 'sci-fi' })],
      [fakeBook({ id: 5, tag_ids: [] })],
      true
    )
    await expect(
      adminApi.setBookState(5, { rating: 0, progress: 0, tag_ids: [1] })
    ).resolves.toBeDefined()

    const { api: readerApi } = signedIn(
      [fakeTag({ id: 1, name: 'sci-fi' })],
      [fakeBook({ id: 5, tag_ids: [] })]
    )
    await expect(
      readerApi.setBookState(5, { rating: 0, progress: 0, tag_ids: [1] })
    ).rejects.toMatchObject({ status: 403 })
  })

  it('lets an admin take a global tag off a book again', async () => {
    // The guard and the replacement have to agree. The fake used to let an
    // admin add a global tag while only clearing their personal links, so a
    // global tag went onto a book and could never come off — a client written
    // against that fake would have looked correct and been wrong.
    const admin = fakeUser({ id: 1, is_admin: true })
    const shared = fakeTag({ id: 10, name: 'sci-fi', owner_id: null, is_global: true })
    const book = fakeBook({ id: 1, tag_ids: [10] })
    const api = new FakeLibraApi({
      users: [admin],
      signedInAs: admin,
      tags: [shared],
      books: [book],
    })

    await api.setBookState(1, { rating: 0, progress: 0, tag_ids: [] })

    expect(book.tag_ids).toEqual([])
  })

  it('keeps a global tag on the book when an ordinary reader writes their own', async () => {
    // The other half of the same rule: a reader may not remove what they may
    // not add, so the shared vocabulary survives their write untouched.
    const reader = fakeUser({ id: 1, is_admin: false })
    const shared = fakeTag({ id: 10, name: 'sci-fi', owner_id: null, is_global: true })
    const mine = fakeTag({ id: 11, name: 'lent-out', owner_id: 1, is_global: false })
    const book = fakeBook({ id: 1, tag_ids: [10] })
    const api = new FakeLibraApi({
      users: [reader],
      signedInAs: reader,
      tags: [shared, mine],
      books: [book],
    })

    await api.setBookState(1, { rating: 0, progress: 0, tag_ids: [11] })

    expect(book.tag_ids).toEqual([10, 11])
  })

  it('counts an id listed twice as one tag, the way the server does', async () => {
    const admin = fakeUser({ id: 1, is_admin: true })
    const shared = fakeTag({ id: 10, name: 'sci-fi', owner_id: null, is_global: true })
    const book = fakeBook({ id: 1, tag_ids: [10] })
    const api = new FakeLibraApi({
      users: [admin],
      signedInAs: admin,
      tags: [shared],
      books: [book],
    })

    await api.setBookState(1, { rating: 0, progress: 0, tag_ids: [10, 10] })

    expect(book.tag_ids).toEqual([10])
  })

  it('takes a deleted tag off every book it was on', async () => {
    const { api } = signedIn(
      [fakeTag({ id: 1, owner_id: 1, is_global: false })],
      [fakeBook({ id: 5, tag_ids: [1] })]
    )

    await api.deleteTag(1)

    expect(await api.listTags()).toEqual([])
    expect((await api.getBook(5)).tag_ids).toEqual([])
  })

  it('answers editable and book_count from who is asking, not from what the test seeded', async () => {
    const { api } = signedIn(
      [fakeTag({ id: 1, name: 'Sci-Fi', editable: true, book_count: 99 })],
      [fakeBook({ id: 5, tag_ids: [1] })]
    )

    expect(await api.listTags()).toMatchObject([{ editable: false, book_count: 1 }])
  })
})
