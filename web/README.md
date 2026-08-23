# libra client

The web client — TypeScript, React and Vite. Phase 4 of the project, see
[docs/architecture.md](../docs/architecture.md).

This replaced a Flutter client on 2026-08-21. The reasons, the cost and the
full stack are in [docs/specs/client-stack.md](../docs/specs/client-stack.md).
The short version: Flutter's web build paints the page onto one canvas instead
of building real page elements, so the accessibility this client promises was
impossible, the app fetched its renderer and a font from Google at every cold
load, and no browser-driving test could click anything.

The design is settled up front in
[docs/specs/client-design.md](../docs/specs/client-design.md). The tokens in
`src/theme/tokens.css` are that document's CSS form and nothing else should
carry a colour, radius or duration.

## Commands

All of these run from `web/`.

```bash
npm ci               # install exactly what the lockfile says
npm run dev          # run against a backend on localhost:8000
npm test             # component tests (Vitest)
npm run e2e          # end-to-end tests in a real browser (Playwright)
npm run lint         # ESLint, including the accessibility rules
npm run typecheck    # tsc --noEmit
npm run format       # Prettier, writing
npm run build        # typecheck, then a production build into dist/
```

`npm run e2e` needs a browser once: `npx playwright install chromium`.

CI runs `npm run format:check`, so format before pushing or the client job
fails on whitespace.

**`e2e/auth.spec.ts` needs a real backend**, the first e2e spec that does —
every earlier one called no endpoint. Start one on port 8000 first, seeded
non-interactively the same way `scripts/run.sh --scratch` seeds one:

```bash
cd ../backend
LIBRA_DATABASE_URL=sqlite:///./e2e-scratch/libra.db \
LIBRA_LIBRARY_DIR=./e2e-scratch/library \
LIBRA_ADMIN_USERNAME=e2e-admin LIBRA_ADMIN_PASSWORD=e2e-password \
  uv run python -m app.cli create-admin --username e2e-admin --if-missing
LIBRA_DATABASE_URL=sqlite:///./e2e-scratch/libra.db \
LIBRA_LIBRARY_DIR=./e2e-scratch/library \
  uv run uvicorn app.main:app --port 8000
```

Then, from `web/`, `npm run e2e` as usual — `npm run dev`'s proxy carries the
session cookie to it, so nothing else changes. Sign in with different
credentials by setting `LIBRA_E2E_USERNAME` / `LIBRA_E2E_PASSWORD` to match
whatever the backend was actually seeded with.

## Running against a real backend

`npm run dev` serves the client on port 5173 and proxies `/api` to
`http://localhost:8000`. The proxy is the point: it makes the browser see one
origin, so the session cookie is sent and no CORS preflight happens at all.

**That means `LIBRA_CORS_ORIGINS` is not needed for normal development.** If
you bypass the proxy and call the backend directly, it is — the backend's list
is empty by default, credentialed requests cannot use a `*` origin, and a
blocked preflight reaches the client as a plain network failure that looks
exactly like a server that is not running.

For the real thing, `scripts/run.sh` from the repository root builds this and
serves it from the backend on one origin.

## Layout

```
src/
├── theme/      tokens.css, fonts.css, base.css, durations.ts
├── api/        LibraApi — the typed client, its HTTP and fake implementations
├── session/    SessionProvider (session state) and RequireSession (route guard)
├── library/    the grid: BookCard/BookCover, SearchBar, filter state, query hooks
├── book/       one book: cover and lightbox, rating, actions, edit form, notes
├── shell/      AppShell, Sidebar, AccountRow, and its SHELVES/TAGS filter sections
├── widgets/    Skeleton, ErrorBlock, EmptyState, Icon, KindleEmailModal
├── screens/    the routed screens: LoginScreen, LibraryScreen, BookScreen
├── routes.ts   every route path, in one place
└── App.tsx     providers and the route table
e2e/            Playwright specs
```

## Things worth knowing before changing anything

**Every route path lives in `src/routes.ts`.** Tests import it rather than
typing a path again — a second copy is a copy that drifts.

**Endpoints are under `/api`, client routes are not.** The client routes on
real URLs, so `/shelves` is an address a reader can reload and share. Without
the prefix that request would reach the endpoint returning the shelf list and
the reader would get JSON instead of the app. The backend's `SpaStaticFiles`
serves `index.html` for client routes and keeps `/api/*` a 404.

**Two kinds of write, two endpoints.** A book's rating, progress and shelf
belong to one reader and save the moment they change, through
`PUT /api/books/{id}/state`. Its title, author, year, pages and blurb are the
shared catalog: they change what everyone sees, so they sit behind Save and
Cancel and go through `PATCH /api/books/{id}`, which is admin-only. The screen
is built around that split — see `src/screens/BookScreen.tsx`.

**`PUT /state` is a PUT.** A body that leaves `rating` or `progress` out does
not keep the old value, it sets it to zero. `BookStateWrite` makes both
required so no call site can do that by accident.

**Queries never retry.** `retry: false` in `src/queryClient.ts`, with the
reasoning there. An automatic retry racing the visible "Try again" button
makes the error blink in and out.

**Fonts are bundled and nothing is fetched.** There is an end-to-end test that
fails if any request leaves localhost.

**Accessibility is enforced, not intended.** `eslint-plugin-jsx-a11y` fails the
build on a clickable `<div>`, and `e2e/shell.spec.ts` checks the real
accessibility tree in a real browser. That second part matters: `flutter test`
read the framework's own tree rather than the page, the two disagreed, and
that is how the old client shipped a sidebar no screen reader could see.

## Pinned versions, and why

**ESLint is pinned to 9, not 10.** `eslint-plugin-jsx-a11y` supports up to 9,
and that plugin is the reason this lint setup exists. 9.39.5 is ESLint's
`maintenance` line rather than an abandoned one. npm warns about it on install;
the warning is expected. Move to 10 when the plugin does.

**TypeScript is pinned to `~6.0.3`, not 7.** `typescript-eslint` supports
`<6.1.0`. `~` rather than `^` so a 6.1 release cannot drift past that range on
its own.
