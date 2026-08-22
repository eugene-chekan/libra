import { ApiError } from './errors'
import type { LibraApi } from './LibraApi'
import type { CurrentUser, User, UserPatch } from './types'

/**
 * A user in the fake, plus the password only the fake knows.
 *
 * The real server stores an Argon2 hash and never sends it anywhere. The fake
 * keeps the plain password because something has to decide whether a login
 * succeeds, and hashing here would test the hash library rather than the
 * client.
 */
export interface FakeUser extends User {
  password: string
}

let nextId = 1

/** Builds a user for a test, with sensible values for everything unstated. */
export function fakeUser(overrides: Partial<FakeUser> = {}): FakeUser {
  const id = overrides.id ?? nextId++
  return {
    id,
    username: `reader${id}`,
    is_admin: false,
    kindle_email: null,
    created_at: '2026-08-22T10:00:00Z',
    password: 'correct-horse',
    ...overrides,
  }
}

interface FakeOptions {
  users?: FakeUser[]
  /** Who is already signed in when the test starts. `null` means nobody. */
  signedInAs?: FakeUser | null
  /** The instance's send-from address, as `/auth/me` reports it. */
  kindleSender?: string | null
}

/**
 * The in-memory server.
 *
 * **It enforces the server's rules, including the surprising ones.** That is a
 * rule from docs/specs/code-style.md, and it was written after a fake that
 * shared the client's misunderstanding turned an integration bug into a
 * passing suite. So this class refuses a login the same way, refuses to let one
 * reader edit another the same way, and treats an absent field in a patch as
 * "leave it alone" rather than "set it to null" — because that is what
 * `exclude_unset=True` does on the other side.
 *
 * What it does not model is the wire: headers, status codes on the way out,
 * JSON encoding. `HttpLibraApi.test.ts` covers that layer, because a fake
 * cannot.
 */
export class FakeLibraApi implements LibraApi {
  private handler: (() => void) | null = null

  readonly users: FakeUser[]
  readonly kindleSender: string | null
  /** Which user the session cookie belongs to. `null` when signed out. */
  signedInId: number | null

  /** Every call this fake has answered, in order. Lets a test count requests. */
  readonly calls: string[] = []

  constructor({ users = [], signedInAs = null, kindleSender = null }: FakeOptions = {}) {
    this.users = users
    this.signedInId = signedInAs?.id ?? null
    this.kindleSender = kindleSender
  }

  setOnUnauthorized(handler: (() => void) | null): void {
    this.handler = handler
  }

  async login(username: string, password: string): Promise<User> {
    this.calls.push('login')
    const user = this.users.find((u) => u.username === username && u.password === password)
    if (!user) {
      // One message for a wrong name and a wrong password, exactly as the
      // server does it. The server goes further and verifies against a dummy
      // hash for unknown users so the two cost the same time — there is no
      // timing here to match, but the message must not come apart.
      this.refuse401('Invalid username or password')
    }
    this.signedInId = user.id
    return publicUser(user)
  }

  async logout(): Promise<void> {
    this.calls.push('logout')
    // The endpoint depends on `current_user`, so signing out twice is a 401
    // rather than a quiet success.
    this.requireSession()
    this.signedInId = null
  }

  async me(): Promise<CurrentUser> {
    this.calls.push('me')
    const user = this.requireSession()
    return { ...publicUser(user), kindle_sender: this.kindleSender }
  }

  async updateUser(id: number, patch: UserPatch): Promise<User> {
    this.calls.push(`updateUser:${id}`)
    const caller = this.requireSession()

    // The order matters and is the server's: ownership first, then existence.
    // A reader who is not an admin gets 403 for an id that does not exist,
    // which is right — otherwise the endpoint would tell them which accounts
    // are real.
    if (id !== caller.id && !caller.is_admin) {
      throw new ApiError(403, 'Cannot modify another user')
    }

    const user = this.users.find((u) => u.id === id)
    if (!user) throw new ApiError(404, 'User not found')

    if ('is_admin' in patch && !caller.is_admin) {
      throw new ApiError(403, 'Only an admin can change admin status')
    }
    if ('password' in patch) {
      if (!patch.password) throw new ApiError(422, 'Password must not be empty')
      user.password = patch.password
    }

    // Only the keys that are present. `kindle_email: null` clears it; leaving
    // the key out does nothing.
    if ('kindle_email' in patch) user.kindle_email = patch.kindle_email ?? null
    if ('is_admin' in patch && patch.is_admin !== undefined) user.is_admin = patch.is_admin

    return publicUser(user)
  }

  private requireSession(): FakeUser {
    const user = this.users.find((u) => u.id === this.signedInId)
    if (!user) this.refuse401('Not authenticated')
    return user
  }

  /** Reports the 401 the way the HTTP client does, then throws it. */
  private refuse401(detail: string): never {
    this.handler?.()
    throw new ApiError(401, detail)
  }
}

/** Drops the fake's own password field, which no endpoint ever returns. */
function publicUser(user: FakeUser): User {
  const { password: _password, ...rest } = user
  return rest
}
