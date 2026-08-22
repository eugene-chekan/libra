import { describe, expect, it } from 'vitest'

import { ApiError } from './errors'
import { fakeBook, fakeShelf, fakeTag, fakeUser, FakeLibraApi } from './FakeLibraApi'

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
