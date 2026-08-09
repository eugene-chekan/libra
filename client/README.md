# libra client

Flutter app (web target first, desktop/mobile later) — Phase 4 of the project,
see [docs/architecture.md](../docs/architecture.md).

The design is settled up front in
[docs/specs/client-design.md](../docs/specs/client-design.md); the tokens in
`lib/theme/tokens.dart` are that document's Dart form and nothing else should
define a colour, radius or duration.

## Commands

All commands run from `client/`.

```bash
flutter pub get                  # install deps
flutter run -d chrome            # run against a backend on localhost:8000
flutter test                     # run the suite
flutter test test/router_test.dart   # a single file
flutter analyze                  # lint
dart format .                    # format
dart format --output=none --set-exit-if-changed .   # what CI checks
```

The backend address is a compile-time define, defaulting to
`http://localhost:8000`:

```bash
flutter run -d chrome --dart-define=LIBRA_API_BASE_URL=http://192.168.1.10:8000
```

## Running against a real backend

The client sends credentialed cross-origin requests, so **the backend must
name the client's origin exactly**. `LIBRA_CORS_ORIGINS` is empty by default
and the CORS spec forbids combining credentials with a `*` origin — the
browser rejects the response rather than warning about it.

```bash
# backend/ — note the port must match wherever the client is served
LIBRA_CORS_ORIGINS='["http://localhost:5000"]' uv run uvicorn app.main:app
```

Get this wrong and every request fails as `NetworkFailure`
("Could not reach the library server."), because a browser reports a blocked
preflight with no detail at all — indistinguishable from the server being
down. If the client cannot reach a backend that is definitely running, check
this first.

Create a user to sign in as with `uv run python -m app.cli create-admin
--username you` from `backend/`.

## Layout

```
lib/
├── main.dart          # ProviderScope + LibraApp
├── app.dart           # MaterialApp.router: theme in, router in
├── router.dart        # go_router, the shell route, and the auth guard
├── api/               # LibraApi + its HTTP and fake implementations
├── session/           # the signed-in reader and the expiry rule
├── theme/             # tokens, type scale, and the Material theme built from them
├── shell/             # sidebar, nav rows, the pinned footer and its account row
├── screens/           # one file per route
└── widgets/           # skeleton, error, empty, page — the shared primitives
```

`api/libra_api.dart` is an interface, and `FakeLibraApi` implements it, so a
single provider override swaps the whole backend out. No test needs a running
server.

## What is built

- **#24 — scaffold.** Routes, shell, sidebar, theme, and the loading / error /
  empty primitives.
- **#25 — API client and auth.** Typed client, credentialed cookies, login,
  route guards, session expiry, the account dropdown, sign-out, and the Kindle
  address modal.

Everything else is a `PendingScreen` naming the issue that replaces it, so the
gap between the frame and the app is visible rather than blank.
