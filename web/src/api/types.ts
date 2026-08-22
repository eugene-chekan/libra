/**
 * The shapes the server sends and accepts.
 *
 * Hand-written, and only the ones this milestone needs. They mirror the
 * SQLModel classes in `backend/app/models.py` — `UserRead`, `CurrentUserRead`,
 * `LoginRequest`, `UserUpdate` — and each one is named after the class it
 * mirrors so the pair is easy to find.
 *
 * Extra fields the server adds later are ignored rather than rejected. That is
 * a deliberate rule from docs/specs/phase-4-plan.md: format conversion will add
 * fields to the book model, and a client that only reads what it names keeps
 * working when that happens.
 */

/** A user as anyone may see them. Never carries the password hash. */
export interface User {
  id: number
  username: string
  is_admin: boolean
  kindle_email: string | null
  created_at: string
}

/**
 * The signed-in user, from `GET /api/auth/me`.
 *
 * `kindle_sender` is the address the instance sends from. It is instance
 * config rather than a property of the user, which is why it is only here and
 * never on the `/api/users` list. Null when the instance has no mail set up.
 */
export interface CurrentUser extends User {
  kindle_sender: string | null
}

/**
 * A change to a user, for `PATCH /api/users/{id}`.
 *
 * Every field is optional and the server only touches the ones that are
 * present — it reads the body with `exclude_unset=True`. So leaving a key out
 * means "do not change it", while sending `null` means "clear it". The two are
 * different, and getting them the wrong way round is how a Kindle address
 * would be wiped by a form that never asked about it.
 */
export interface UserPatch {
  password?: string
  kindle_email?: string | null
  is_admin?: boolean
}
