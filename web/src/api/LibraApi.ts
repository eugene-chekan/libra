import type { CurrentUser, User, UserPatch } from './types'

/**
 * Everything the client can ask the server for.
 *
 * This interface is the seam. `HttpLibraApi` talks to a real server;
 * `FakeLibraApi` answers from memory. Screens are handed one of them and
 * cannot tell which, so the whole component suite runs with no backend and no
 * network, and the end-to-end suite runs against the real thing.
 *
 * One method per endpoint, named after it, with the same arguments the
 * endpoint takes. It is deliberately a thin mirror rather than a convenience
 * layer: a method that quietly makes two requests hides the API from the code
 * that reads it, and this milestone exists to check that the API is right.
 *
 * Later milestones add books, shelves, tags and notes here.
 */
export interface LibraApi {
  /**
   * Registers the one handler that runs on every 401 the server returns.
   * `null` clears it. A second call replaces the first — there is exactly one
   * listener, because there is exactly one thing in the app that needs to
   * know: `SessionProvider`.
   *
   * A method rather than a public field the caller assigns directly, so that
   * registering it is a call, not a mutation of an object a hook handed back —
   * `SessionProvider` holds the one `LibraApi` instance for the app's
   * lifetime via `useApi()`, and writing straight to a property on that
   * object is exactly the pattern `eslint-plugin-react-hooks`'s immutability
   * rule exists to catch.
   *
   * It lives on the interface, not only on the HTTP client, because the fake
   * has to behave the same way — a fake that never reports an expired session
   * would make the expiry tests pass without testing anything.
   *
   * Every 401 fires it, including a wrong password on the login screen. Deciding
   * which of those actually ends a session is one rule and lives in one place,
   * `SessionProvider`, which is the only thing that knows whether a session was
   * live in the first place.
   */
  setOnUnauthorized(handler: (() => void) | null): void

  /** `POST /api/auth/login`. Sets the session cookie. 401 on bad credentials. */
  login(username: string, password: string): Promise<User>

  /** `POST /api/auth/logout`. Revokes the session on the server, not only in the browser. */
  logout(): Promise<void>

  /** `GET /api/auth/me`. 401 when there is no session — this is also the cold-load probe. */
  me(): Promise<CurrentUser>

  /** `PATCH /api/users/{id}`. Only the fields present in `patch` change. */
  updateUser(id: number, patch: UserPatch): Promise<User>
}
