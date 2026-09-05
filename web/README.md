# libra client

The web client — TypeScript, React and Vite. Phase 4 of the project, see
[docs/architecture.md](../docs/architecture.md).

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

`npm run dev` serves the client on port 5173 and proxies `/api` — and
`/health`, the one endpoint outside that prefix — to `http://localhost:8000`.
The proxy is the point: it makes the browser see one origin, so the session
cookie is sent and no CORS preflight happens at all.

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
├── book/       one book: cover and lightbox, rating, tags, actions, edit form, notes
├── shell/      AppShell, Sidebar, AccountRow, and its SHELVES/TAGS filter sections
├── widgets/    Skeleton, ErrorBlock, EmptyState, Modal, ConfirmDialog, Icon
│            plus dropdownMenu.module.css — the one menu style, for every menu
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

**A tag goes onto a book from the book screen, not from the edit form.** The
design drew it in the form; the form is admin-only, and personal tags are not.
See gap 8 in client-design.md. `src/book/BookTags.tsx` is the only place in the
app that writes `tag_ids`.

**A tag write must name exactly what the caller may set, and no more.**
`PUT /api/books/{id}/state` replaces what it is sent. A reader sends only their
own personal tags, so the book's shared tags are left alone; an admin sends
everything, because their write replaces shared tags too and anything left out
comes off. Getting this wrong does not fail loudly — it quietly drops a tag.

**Queries never retry.** `retry: false` in `src/queryClient.ts`, with the
reasoning there. An automatic retry racing the visible "Try again" button
makes the error blink in and out.

**Fonts are bundled and nothing is fetched.** There is an end-to-end test that
fails if any request leaves localhost.

**Accessibility is enforced, not intended.** `eslint-plugin-jsx-a11y` fails the
build on a clickable `<div>`, and `e2e/shell.spec.ts` checks the real
accessibility tree in a real browser — a framework's own testing utilities can
report a clean tree while the rendered DOM has none, so only a real browser
check is trustworthy.

## Pinned versions, and why

**ESLint is pinned to 9, not 10.** `eslint-plugin-jsx-a11y` supports up to 9,
and that plugin is the reason this lint setup exists. 9.39.5 is ESLint's
`maintenance` line rather than an abandoned one. npm warns about it on install;
the warning is expected. Move to 10 when the plugin does.

**TypeScript is pinned to `~6.0.3`, not 7.** `typescript-eslint` supports
`<6.1.0`. `~` rather than `^` so a 6.1 release cannot drift past that range on
its own.

**`@xmldom/xmldom` is overridden inside epubjs.** epubjs asks for `^0.7.5`,
which resolves to a version npm itself marks "this version has critical
issues", and `npm audit` reports six advisories against everything up to
0.8.14. The `overrides` block in `package.json` pins epubjs's copy to
`^0.8.15`, that package's `lts` line. JSON carries no comments, so the reason
lives here.

**Do not run `npm audit fix --force` on this.** It installs `epubjs@0.4.2`,
which is not the current release — npm's `latest` tag is the `0.3.93` we have
— and which depends on the old unscoped `xmldom@^0.1.27`, carrying seven
advisories including a critical one with no fix. See issue #97.
