# Client Stack — Moving from Flutter to TypeScript

**Status:** Decided 2026-08-21. This replaces the client technology choice
made in [phase-4-plan.md](phase-4-plan.md). No new client code exists yet.

## The short version

The web client was built with Flutter. It moves to TypeScript and React.

The design does not change. The screens do not change. The API does not
change. Only the tools that build the screens change.

## Words used in this document

- **DOM** — the list of parts a web page is made of: buttons, headings,
  links, text. The browser builds it. Other programs can read it.
- **Screen reader** — software that reads a page out loud for a blind user.
  It reads the DOM. If something is not in the DOM, it does not exist.
- **Canvas** — one blank drawing surface inside a web page. Anything drawn on
  it is only coloured dots. There are no parts inside it to read.
- **CDN** — someone else's server on the internet that hands out shared files,
  such as fonts.

## Why we are moving

Flutter's web build does not create a DOM. It creates one canvas and paints
every dot of the app onto it. That one fact caused three problems.

### 1. The client promises accessibility it cannot deliver

[client-design.md](client-design.md) says:

> Interactive elements are real buttons, focusable and keyboard-activatable.
> [...] Every icon-only control [...] carries an accessible label.

The client does not do this. Issue #50 measured it on a running build. The
whole sidebar — Library, Shelves, Librarian, Add Book, and the account row —
reaches a screen reader as nothing at all. About nine parts exist inside
Flutter and never reach the page.

This is not a case of missing labels. `client/lib/widgets/tappable_row.dart`
labels every row, and its comment says it exists for exactly this reason. The
labels are written. They stop before the page.

`flutter test` cannot catch this. It reads Flutter's own list of parts, not
the real page, and the two do not agree here. This is written down in
[code-style.md](code-style.md) under "Verify accessibility claims against a
build".

A design spec whose accessibility section is false is worse at a defence than
one that never made the promise.

### 2. "Local-first" was only half true

[phase-4-plan.md](phase-4-plan.md) states the rule itself:

> A local-first application that needs the network to render text is a
> contradiction that would not survive review.

Then:

- **Issue #49** — the client downloads its drawing engine from Google at every
  cold start, so an instance with no internet renders a blank page. A fix
  exists on the `fix/local-canvaskit` branch, which copies the engine into the
  build, but PR #52 was closed rather than merged, so `main` still has this.
- **Issue #51** — the client also downloads the Roboto font from Google,
  because the drawing engine carries its own font. Open.

Each fix removes one symptom. The cause stays, and the next symptom is one
framework upgrade away.

### 3. There was no way to test the client end to end

Issue #50 was found while trying to drive the client with Playwright, a tool
that clicks through a real browser. Playwright could not work, because there
is nothing in the page to click.

That is why [evaluation.md](../evaluation.md) said the client had no automated
evaluation and would be checked by hand. That reads like a choice. It was a
limit.

`CLAUDE.md` says testability is a first-class concern here. For the client, it
could not be.

## What this costs

About 9,900 lines of Dart are thrown away: 7,489 in `client/lib` and 2,455 in
`client/test`.

The thinking is not thrown away. The expensive part of client work was making
decisions, and those decisions live in Markdown, not in Dart:

- the six design gaps closed in [client-design.md](client-design.md)
- the OR and AND rules for tag filtering
- the `PUT /books/{id}/state` trap, where leaving out `rating` or `progress`
  sets them to zero
- the `/starting` route, for the moment before the session is known
- the rule that session expiry fires once

All of that carries over without change. The rewrite is mostly retyping.

## Why now, and not later

Milestones 0 to 6 are done. Milestones 7 to 12 are not. One of those, #35, is
backend work and is not affected at all.

- Move now: rewrite 6 screens, build 5 new ones.
- Move after the chat and the reader ship: rewrite 12.

The price only grows.

The project started on 29 July 2026. This was decided on 21 August 2026, 23
days in, with about five months left. Phase 2 and Phase 3 — the RAG pipeline
and the agent, which [phase-4-plan.md](phase-4-plan.md) calls the real
contribution — have not started. That is the time this move must not eat.

## Why React, and not another TypeScript framework

The original design handoff, at commit `9b1b423`, is a React prototype: 2,044
lines of JSX across six screens, plus a `LibraTokens` object holding the whole
palette.

| Prototype file | Screen | Flutter status |
|---|---|---|
| `page-library.jsx` | Library grid | built |
| `page-detail.jsx` | Book detail | built |
| `page-shelves.jsx`, `page-shelves-manager.jsx` | Shelves | built |
| `page-tags.jsx` | Tag manager | **not built (#29)** |
| `page-add.jsx` | Add Book | **not built (#30)** |
| `components.jsx` | Covers, progress bars, shared parts | — |

The two screens that are not built yet already exist as React code.

So the design already speaks React. Any other framework means translating it
twice. React is not chosen here because it is better than Svelte or Solid. It
is chosen because it is what the design is already written in.

**The prototype is a picture, not a source of code.** Its rows are
`<div onClick>` with no keyboard support, which is the exact defect this move
exists to fix. Six of its assumptions also disagree with the real API — see
"Where the design and the API disagree" in
[phase-4-plan.md](phase-4-plan.md). Look at it while building. Do not copy
from it.

## The stack

| Part | Choice | Why |
|---|---|---|
| Language | TypeScript | Types catch mistakes before the browser does |
| Build tool | Vite | Produces plain static files, which is what the backend serves |
| Framework | React | The design prototype is React |
| Routing | React Router | Does the job `go_router` did; there are only 6 routes |
| Server data | TanStack Query | Gives loading, error and data as one value — the reason Riverpod was picked |
| App state | React Context | The only shared state is the session. No state library needed |
| Accessible parts | Radix UI | Real focus traps, keyboard support and dialog behaviour, with no styling attached |
| Styling | `tokens.css` variables + CSS Modules | Keeps the "no raw colour outside the token file" rule checkable with grep |
| Component tests | Vitest + React Testing Library | Replaces `flutter test` |
| End-to-end tests | Playwright | The thing Flutter blocked |
| Wire-format tests | MSW | Replaces the mock transport in `test/api/http_libra_api_test.dart` |
| Lint | ESLint + `eslint-plugin-jsx-a11y` | Fails the build on `<div onClick>` |
| Format | Prettier | Replaces `dart format` |
| Fonts | Bundled locally, converted to `.woff2` | Same files as `client/assets/fonts/`, smaller format |

### The two picks that matter most

**Radix UI replaces Material.** `client/lib/theme/theme.dart` says Material was
chosen only for accessibility — focus handling, keyboard activation, dialog
behaviour. [client-design.md](client-design.md) asks for exactly this: modals
trap focus, return it to the button that opened them, and close on Escape.
Radix does all of that and ships no styling to fight. Unlike Material here, it
produces a real DOM.

**`eslint-plugin-jsx-a11y` makes one rule automatic.**
[code-style.md](code-style.md) says none of its rules can be checked by a
machine. For accessibility that stops being true. This plugin fails CI on a
clickable `<div>`, which is the defect the handoff's own gap list complained
about. The rule moves out of a document and into the build.

## Rules carried over from the Flutter client

These were learned the hard way and are easy to lose in a rewrite.

**Turn automatic retry off.** Set `retry: false` on TanStack Query. Riverpod
retried forever, and milestone 4 removed it because an invisible retry fights
the visible "Try again" button: the error blinks in and out and the reader
cannot tell whether their click did anything. TanStack Query retries three
times by default. Same bug, new library.

**The fake copies the server, including its odd parts.** `FakeLibraApi` models
the `PUT /books/{id}/state` hybrid, where `shelf_id` and `tag_ids` are left
alone if missing but `rating` and `progress` reset to zero. Keep this as a
hand-written class behind an interface. Use MSW only for the tests that check
the exact shape of requests on the wire.

**No raw colour outside the token file.** One `tokens.css` holds every colour,
size and radius as a CSS variable. A raw `#8b5e3c` inside a component is a
token that escaped, and the next person who needs it will pick a slightly
different one.

**Bundle the fonts.** The five font files in `client/assets/fonts/` move over
and are loaded with `@font-face`. The prototype loads them from
`fonts.googleapis.com`. Do not repeat issue #51.

**Every screen and component gets at least one test.** Both bugs found in the
#28 review were in code no test touched.

**Test what is on the screen, not that nothing crashed.**

## The reader, and why epub.js is allowed now

[phase-4-plan.md](phase-4-plan.md) chose `flutter_html` over epub.js for a
real reason. Book files are uploaded by users. Putting that HTML into a normal
page that carries a session cookie lets the book's own code steal the session.
This is called stored XSS. The plan says plainly that Flutter "avoids the
question instead of answering it", and that epub.js is the better reader.

A DOM client brings the question back. The answer is standard:

Render each chapter inside an `<iframe sandbox>`, and do **not** add
`allow-same-origin`. An iframe is a page inside a page. With that setting the
chapter sits in its own empty origin, cannot see the cookie, and cannot reach
the app around it.

This is a well-known solution, and it lets us use the reader the plan already
said was better. Milestone 11 (#35) is backend work — `epub.read_spine` and
the chapter endpoints — and is not affected.

## How the move happens

**The Flutter client is deleted first, not kept in parallel.**

This document first said `client/` would stay alive until the new client
reached milestone 6, so that there was always a working app to show. That was
overruled the same day. Carrying a dead app is not free: it keeps a CI job, a
lint config, a build step in `scripts/run.sh`, and a Flutter install on every
machine — all to serve screens that are replaced within weeks. And a working
old app is a quiet argument for postponing the new one.

So `client/` goes in one commit, with its CI job and its build step. The
backend already copes: `backend/app/main.py` mounts the client only when
`backend/app/web/` exists, and logs "serving the API only" when it does not.
Until `web/` is built, `scripts/run.sh` starts the API alone.

The new client then lives in `web/`, built from nothing.

**The fonts come back out of history, they are not kept.** The five font files
and their OFL licence texts go with `client/`. Recover them when `web/` needs
them:

```bash
git log --oneline --diff-filter=D -- client/assets/fonts/   # find the removal
git checkout <that commit>^ -- client/assets/fonts/
```

This is the same pattern the design handoff bundle already uses — removed from
the tree, recoverable from history, with the command written down.

**Three weeks to reach milestone 6.** [phase-4-plan.md](phase-4-plan.md)
already warns that UI work has no natural end. A new set of tools makes that
worse. If three weeks pass and the new client is not level with the old one,
that is information, and Phase 2 and Phase 3 still get their months.

**No new Flutter code from 2026-08-21.** Milestone 7 onward is built once, in
the new client.

## Still open

Neither of these blocks a start.

- **How the chat streams.** `EventSource` is the simple browser tool for a
  stream of server messages, but it can only send a GET request, and the chat
  needs to POST the reader's message. `fetch` with a readable stream can do
  both. Decide in milestone 10, with the endpoint in front of us.
- **Whether `web/` keeps its name** once `client/` is deleted. Renaming later
  is cheap; deciding it now is not worth the argument.

## What we give up

Two real losses, written down rather than discovered later.

**Phase 5 stops being free.** Flutter offered desktop and mobile from the same
code as an extra build target. That is gone. The honest replacements are a PWA
(a web app a phone can install like a normal app), or a wrapper such as Tauri
or Capacitor. Phase 5 is after the diploma and at its own pace, so this costs
nothing inside the diploma window — but it is a real change to the plan, and
[architecture.md](../architecture.md) is updated to say so.

**Many small choices reopen.** Router, state, styling and test runner were all
settled in the Flutter client. They are settled again in the table above, in
one sitting, on purpose. This is the biggest risk to the three-week timebox:
not the code, but the pull to keep reconsidering the tools.
