# Spec: Application Layering

**Status:** Adopted as a rule for new work, not scheduled as a refactor.
Nothing in this document requires rewriting existing code; it decides where
the code written in milestones [#5–#10](phase-1-plan.md#sequence) goes, and
why.

`app/library.py` now exists, created in #14 for the merged read model and
extended in #15 with `send_to_kindle`. The rule has held so far: nothing in
it raises `HTTPException`, and simple CRUD has stayed in the routers.

## Goal

Make sure the library operations Phase 3's agent needs are callable from
somewhere other than an HTTP route handler — without paying for a layer of
indirection on the CRUD that will only ever have one caller.

## Where things actually stand

Measured 2026-08-05, after [#12](https://github.com/eugene-chekan/libra/pull/12):

| Module | Lines | Knows about HTTP? |
|---|---|---|
| `app/auth.py` | 202 | only the dependencies at the bottom |
| `app/epub.py` | 170 | no |
| `app/storage.py` | 140 | no |
| `app/models.py` | 126 | no |
| `app/routers/books.py` | 170 | yes |
| `app/routers/users.py` | 91 | yes |
| `app/routers/auth.py` | 62 | yes |

So the codebase is not the "everything in the controller" shape this
document might otherwise be correcting. `storage.py` deliberately knows
nothing about books, `epub.py` nothing about the database, and both are
tested directly. That separation is real and worth keeping.

What is missing is a home for **orchestration**: the code that sequences
those primitives into an operation. Today that lives in route handlers, and
`upload_book` is the clearest case — roughly fifty lines of
stage → validate → parse → commit → insert with `HTTPException`s
interleaved, reachable only through HTTP.

## Why this matters, concretely

Not tidiness. Phase 3.

The librarian agent's tool set is already named in
[architecture.md](../architecture.md): `search_library`,
`get_book_metadata`, `answer_about_book`, `recommend_similar`. The first two
need exactly what `GET /books` does — the same filtering, and the same rules
about what the calling user is allowed to see.

If that logic lives in a route handler, the agent has two options:

1. **Call itself over HTTP.** An in-process agent making requests to its own
   server to read a database it is already connected to.
2. **Reimplement it.** Which means two implementations of the user-scoping
   rules.

Option 2 is the dangerous one, and it is already ruled out in
architecture.md: *"an authorization boundary present in one interface and
absent in the other is not a boundary."* A shared module is how that
boundary gets exactly one implementation. Writing #9 inside a route handler
is choosing option 2 by default, four months before anyone notices.

Phase 2 has a weaker version of the same need: RAG ingestion reads books and
their files, and will want to do that without a request in scope.

## The shape

```
app/
  routers/      HTTP only — parse the request, call one thing, map errors
  library.py    orchestration + row-level authorization        <- new
  auth.py       identity primitives + FastAPI dependencies
  storage.py    filesystem primitives, no book knowledge
  epub.py       parsing primitives, no storage knowledge
  models.py
```

**A flat module, not a `services/` package.** At this size a package
containing one file is ceremony. Split `library.py` when it passes roughly
300 lines, along whatever seam is obvious by then — probably shelves and
tags separating from books.

**Not a repository layer.** SQLModel sessions are already the data-access
abstraction, and wrapping them in per-entity repositories would add a layer
whose only job is forwarding. The thing worth extracting is the *decision*,
not the query.

## The rule

> Logic leaves a router the moment a second caller exists **or is known to be
> coming.**

Routers keep: request parsing, response shaping, and mapping domain errors to
status codes. That is a real job and it should not migrate into `library.py`
— a service function that raises `HTTPException` has defeated the point,
because the agent then has to catch HTTP exceptions to read a book.

Domain functions raise domain errors (`InvalidEpubError`, `NotVisibleError`);
routers translate them. This is the pattern `epub.py` and the upload route
already use together, and it generalises.

## Per-milestone application

| Milestone | Where the logic goes | Why |
|---|---|---|
| [#5](https://github.com/eugene-chekan/libra/issues/5) reading state | Mostly router. **Extract** "read a book as user X sees it" | That read model is what `get_book_metadata` returns |
| [#6](https://github.com/eugene-chekan/libra/issues/6) Kindle delivery | `mailer` module for transport (already specced); **extract** the send operation | "Send this to my Kindle" is a plausible agent tool |
| [#7](https://github.com/eugene-chekan/libra/issues/7) shelves | Router for CRUD; **extract** the ownership check | `shelf_id` must belong to the caller — a rule the agent needs too |
| [#8](https://github.com/eugene-chekan/libra/issues/8) tags | Router for CRUD; **extract** tag visibility | Global ∪ own is the same rule everywhere it appears |
| [#9](https://github.com/eugene-chekan/libra/issues/9) search | **`library.py` from day one** | This *is* `search_library`. Do not write it in a handler |
| [#10](https://github.com/eugene-chekan/libra/issues/10) covers | Router | HTTP plus `epub.py`; no second caller, now or later |

### What not to extract

- **Simple CRUD.** `POST /shelves` creating a row does not need a service
  function that creates a row. A passthrough layer is worse than no layer:
  it costs a file, a test, and a reader's attention to learn it does nothing.
- **`require_admin`.** A FastAPI dependency is the right tool for a coarse
  role check, and it composes with the route table — which is what makes the
  [exhaustive 401 sweep](../../backend/tests/test_permissions.py) possible.
  Only *row-level* authorization ("is this your shelf?") needs to be callable
  from elsewhere.
- **Anything with one caller and no known second.** The rule cuts both ways.

## Testing implications

Extraction pays for itself in tests before it pays for itself in Phase 3.

- **Domain functions are testable without HTTP.** The upload pipeline's
  ordering discipline — a malformed file never reaching the library, a failed
  insert never orphaning one — is currently asserted through the API because
  there is no other door. Those are the project's most important invariants
  and they deserve direct tests.
- **Router tests get narrower**: does this map a domain error to the right
  status code, and does it reject the wrong caller.
- **The trap is testing everything twice.** Behaviour is tested at the domain
  level; routers are tested for HTTP mapping and authorization. If a router
  test is asserting business rules, the logic is probably in the wrong place.

## Migration

**No refactor is scheduled.** Roughly seven weeks and six milestones remain
in Phase 1; rewriting working, tested code to a new shape would consume that
budget and produce no feature.

New code follows the rule above. Existing code moves only when something
needs it to:

- `upload_book`'s pipeline moves when Phase 2 needs to ingest a file outside
  a request. That is a real second caller, and it is the right moment.
- `GET /books` moves as part of #9, which rewrites it anyway.
- `users.py` and `auth.py` routers are already thin. Leave them.

## Open questions

- **Does the agent call these functions in-process, or across a boundary?**
  In-process is the assumption here, and it is what makes shared scoping
  rules possible. If the agent ever becomes a separate service, this document
  needs revisiting — the boundary would then have to be enforced twice, which
  is precisely what it is trying to avoid.
- **Do domain functions take a `Session`, or open their own?** Taking one
  keeps a request's work in a single transaction and matches how the routers
  already work; opening their own would make agent calls simpler at the cost
  of transactional control. Taking one, probably, but it should be decided
  once rather than per function.
- **Where exactly do permission checks live?** Coarse role checks stay as
  dependencies. Row-level checks move. The boundary between the two is clear
  in the cases known today (#7, #8) and may not stay that way.
- **Does a `NotVisibleError`-style domain error hierarchy earn its keep,** or
  is returning `None` and letting the router decide enough? The `404`-vs-`403`
  rules in [library-organization.md](library-organization.md#error-handling)
  are subtle enough that encoding them in domain errors may be worth it —
  but that is a decision for #7, with a real case in front of it.
