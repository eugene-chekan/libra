# Spec: Admin Page

**Status:** Design approved 2026-08-26. Not yet built. Covers milestone 9 of
[phase-4-plan.md](phase-4-plan.md) (issue #31), and **replaces** the Manage
Users modal design in [client-design.md](client-design.md)'s Gap 2 — see the
note added there.

## Why a page, not a modal

The modal design in Gap 2 was fully specified and would have worked. It was
changed on request, for one reason: user administration is going to grow.
Fine-grained per-user permissions (who may delete a book, upload, manage
tags — filed separately, see [Out of scope](#out-of-scope)) need real screen
space, and other admin concerns — database maintenance, server settings —
are coming later. A modal does not grow well; a page with tabs does.

**Only the Users tab is built now.** No stub tabs for the other sections.
This project already decided that question once, for RAG management in
[phase-4-plan.md](phase-4-plan.md#not-built--rag-management): drawing a tab
for a subsystem nobody has designed yet is inventing requirements, not
stubbing. When database maintenance or server settings are actually scoped,
they get their own tab and their own spec.

## Scope

**In scope:**
- A new `/admin` page, admin-only, reached from a new row in the sidebar.
- A tab shell that holds one tab today (Users) and is built to hold more
  later, without redesigning it when the second tab arrives.
- The Users tab: the same list, add, edit and delete behaviour Gap 2 already
  specified, moved from a modal into page content.
- No backend changes. `GET/POST /users`, `PATCH /users/{id}`,
  `DELETE /users/{id}` already exist and already do everything this needs.

**Out of scope:**
- Fine-grained per-user permissions (book deletion, upload, tag management,
  and so on). This is a real authorization change — a new data shape, and a
  check added to every write endpoint it covers — not a client-only feature.
  Filed as its own issue once this page ships, since the Users tab is where
  its controls would live.
- Any tab beyond Users: database maintenance, server settings. Not designed,
  not stubbed.
- Anything about *how* a reader is authenticated. This page manages
  accounts; it does not touch login, sessions, or password hashing.

## Routing and the admin-only guard

Two new paths in `web/src/routes.ts`:

```ts
admin: '/admin',
adminUsers: '/admin/users',
```

`/admin` redirects to `/admin/users`, the same pattern
[phase-4-plan.md](phase-4-plan.md#technical-decisions) already uses for `/`
→ `/library`: a bookmarkable, reloadable address for the default tab, rather
than the tab shell deciding what to show on its own.

**A new `RequireAdmin` guard**, in `web/src/session/RequireAdmin.tsx`,
alongside the existing `RequireSession`. It assumes a session already
exists — it nests *inside* `RequireSession`'s subtree in the route table,
never outside it — and checks one thing: `status.user.is_admin`. A reader
who is not an admin is sent to `/library`, not shown an error page; nothing
about `/admin` is worth explaining to someone who was never going to see it.
This is the same courtesy-plus-real-guard split the rest of the app already
uses for admin-only controls (Edit Book, the global-tag checkbox): the
route redirect is the courtesy, `require_admin` on every endpoint underneath
is the actual guard, and it was already there before this page existed.

The route table addition, inside the existing `AppShell` branch so the page
keeps the normal sidebar:

```tsx
<Route element={<RequireAdmin />}>
  <Route element={<AdminLayout />}>
    <Route path="/admin" element={<Navigate to={routes.adminUsers} replace />} />
    <Route path={routes.adminUsers} element={<AdminUsersScreen />} />
  </Route>
</Route>
```

## Entry point

A new **"Admin" row in the sidebar's primary nav**, admin-only. Not the
account dropdown — a dropdown holds account-scoped actions (Kindle Email,
Sign Out), and this is an app-wide section, the same kind of thing Library
or Shelves is.

`primaryNav` in `routes.ts` today has no idea of roles; every row in it
renders unconditionally. Rather than teach that array about permissions,
Admin is added the same way Add Book already is — as its own row in
`Sidebar.tsx`, rendered only when `status.user.is_admin`, sitting after the
regular nav rows. Needs one new icon (a shield, added to `Icon.tsx`'s set).

## The tab shell

`web/src/screens/AdminLayout.tsx`: a page heading ("Admin"), a tab bar below
it, and a React Router `<Outlet />` for whichever tab is active. Tabs are
real routes, not client-side view state — `/admin/users` today, `/admin/db`
or similar later — matching this app's existing rule that a filtered or
switched view belongs in the URL so it survives a reload and works with the
back button.

The tab bar renders even with a single tab. It is not a "when there are 2+
tabs, show a bar" conditional — the point of building the shell now is that
it already looks and behaves like what it will be once a second tab exists.

## The Users tab

`web/src/screens/AdminUsersScreen.tsx`, using new pieces under
`web/src/users/`. Unlike Shelves — which keeps a browse page (`ShelvesScreen`)
separate from a management modal (`ShelfManager`), because looking at
shelves and managing them are genuinely different tasks — there is no
"browse" mode for user accounts worth separating out. The tab *is* the
management screen.

**Rows** (`UserRow.tsx`, mirroring `ShelfManagerRow.tsx`'s view/edit split):
- 28px circular avatar, same treatment as the sidebar's own.
- Username, and beneath it the Kindle address, or "No Kindle address" in
  italic when null.
- An "Admin" badge when `is_admin`.
- Pencil (edit) and trash (delete) buttons. **No trash button on the
  caller's own row** — a courtesy; `DELETE /users/{id}` already refuses
  self-deletion with `409` regardless.

**Edit** expands the row in place: Kindle address field, an Administrator
checkbox, and a "Set new password" field that starts blank — blank means
unchanged, exactly how `UserPatch.password` already works. Save writes
`PATCH /users/{id}` and collapses back to the view row. Writes commit
**per row, immediately** — no batch, no page-level Save. This is not a new
decision; it is the same one milestones 6 and 7 already made for shelves and
tags, recorded in [phase-4-plan.md](phase-4-plan.md#milestones): a batch
that half-fails leaves the reader unable to tell what took effect, and the
reconciling that batching was supposed to buy happens inside one server
transaction either way.

**Adding a user** (`AddUserRow.tsx`): a dashed "+ Add User" row, matching
the dashed-button treatment already used elsewhere (the sidebar's own
disabled-then-real Add Book button was this same visual language). Clicking
it expands an inline form — Username, Password, an Administrator checkbox —
with Cancel and Create. Collapses on either. Posts `POST /users`.

**Delete** opens the existing `ConfirmDialog`, reused as-is, stating exactly
what the backend does:

> Their shelves, personal tags, reading progress, notes, and sessions are
> deleted. Books they uploaded stay in the library.

## Data and API

No backend work. The client gains three calls it does not have yet
(`updateUser` already exists, used today by the Kindle Email modal):

| `LibraApi` method | Endpoint |
|---|---|
| `listUsers()` | `GET /users` |
| `createUser(user: UserCreate)` | `POST /users` |
| `deleteUser(id)` | `DELETE /users/{id}` |

`UserCreate` is a new client type, mirroring the backend's own:
`{ username: string; password: string; is_admin?: boolean; kindle_email?: string | null }`.

`FakeLibraApi` needs to mirror the server's rules for the two calls it does
not cover yet: `listUsers`/`createUser` are `require_admin` (403 for anyone
else); `createUser` normalises the username the same way the server does
(trim, lowercase) and refuses a taken one with `409`; `deleteUser` refuses
the caller's own id with `409` before it refuses anyone else's — the fake
already has this exact ordering for `updateUser`'s admin-status guard, and
it applies here for the same reason.

## Testing

- Component tests for `RequireAdmin` (redirects a non-admin, renders the
  outlet for an admin), `AdminLayout` (renders the tab, renders the child
  route), and `AdminUsersScreen`/`UserRow`/`AddUserRow` (list, create,
  per-row edit, no trash on the caller's own row, delete confirm).
- Wire-format tests for the three new `HttpLibraApi` calls, and
  `FakeLibraApi` tests for the two new rule sets (admin-only list/create,
  self-deletion refusal), the same shape as the existing tag/shelf write
  tests.
- An e2e spec: a non-admin session hitting `/admin` lands on `/library`; an
  admin session creates, edits, and deletes a user against a real backend.

## Open questions

None blocking. Two small calls, left to implementation:

- **Whether the tab bar needs its own visual weight with one tab in it**, or
  whether a single-tab bar reads as clutter until a second tab exists. A
  CSS-level call, not a behavioural one — worth a look once it is on screen
  rather than guessed at now.
- **The shield icon's exact glyph.** Any icon reading as "admin" or
  "security" in the existing Lucide-style set already in `Icon.tsx` is
  fine; no specific one is prescribed here.
