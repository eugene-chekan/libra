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

## Layout

```
lib/
├── main.dart          # ProviderScope + LibraApp
├── app.dart           # MaterialApp.router: theme in, router in
├── router.dart        # go_router; the shell route lives here
├── theme/             # tokens, type scale, and the Material theme built from them
├── shell/             # sidebar, nav rows, the pinned footer and its account row
├── screens/           # one file per route
├── session/           # the signed-in reader; the seam #25 replaces
└── widgets/           # skeleton, error, empty, page — the shared primitives
```

## What is built

Milestone 2 (#24) — the scaffold: routes, shell, sidebar, theme and the
loading/error/empty primitives. Every screen is a `PendingScreen` naming the
issue that replaces it, so the gap between the frame and the app is visible
rather than blank. The API client and authentication are #25, and nothing here
talks to the backend yet.
