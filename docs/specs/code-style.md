# Spec: Code Style and Clean Architecture

**Status:** Adopted as a rule for new work, not scheduled as a refactor.
Nothing here requires rewriting existing code. It records rules that were
learned from defects this codebase actually shipped, so the next milestone
does not re-learn them.

Every rule below cites the bug that produced it. A style guide of general
advice is unfalsifiable and gets ignored; a rule with a scar attached does
not. Where a rule has no scar yet, it is not in this document.

Linters and formatters are a hard gate (`ruff`, `flutter analyze`,
`dart format`), but they catch none of what follows — every defect below
passed CI green.

## Code style

### One decision lives in one place

`_noRetry` was declared twice, verbatim, in `library/providers.dart` and
`book/providers.dart`. Both said "retry is off"; only one said why, and the
two comments had already drifted apart in wording. Turning retry back on, or
changing the policy, meant finding both.

If two files need the same decision, the decision moves up, not sideways.

### Do not hand-roll what the SDK already gives you

`library_screen.dart` carried `T? _firstOrNull<T>(Iterable<T>)` while
`book_screen.dart`, eleven lines of logic away, used the real
`.firstOrNull`. Two spellings of one operation, and a reader has to check
whether they differ.

Before writing a helper, check whether the language or framework has it.

### Tests import constants; they never transcribe them

`book_screen_test.dart` declared a local `confirmation = 2600ms` "mirroring"
`LibraDurations.transientConfirmation`, which is `2500ms`. The copy had
already drifted, and retuning the token would have left the test pumping an
interval with no relationship to the behaviour it asserted. A sibling test
(`skeleton_test.dart`) imported the token directly, so the rationale in the
comment was not even true of the suite it lived in.

Import the constant. If importing it feels wrong, that is a signal the
constant is in the wrong place, not that the test should copy it.

### Prefer no comment at all

**A comment inside a function is the last resort, not the first.** Reach for a
name, a smaller function, or a docstring before reaching for a `//`.

Three questions, in order:

1. **Can the code say it?** A comment explaining what a line does means the
   line is unclear. Rename the variable, pull the condition into a named
   function, and delete the comment.
2. **Is it about the whole thing?** Rationale — why this shape, which rule of
   the server's it follows, what was tried and rejected — belongs in the
   **docstring** at the top of the function, class or module, where somebody
   reading the signature will find it.
3. **Is it bigger than one file?** A decision that spans screens or endpoints
   belongs in `docs/specs/`, with the code pointing at it in one line.

What survives all three is rare: a genuine surprise the reader cannot deduce
and the code cannot express. A browser quirk. An endpoint that behaves unlike
its siblings. Write those, and write them tightly.

This is a correction to how this codebase was written up to Phase 4. Whole
files carried a paragraph above every second statement, which reads as noise
and hides the two comments that were load-bearing. Prose is not free: it goes
stale, it has to be reviewed, and a wall of it trains the reader to skip the
lot — including the one line that mattered.

### A comment is a claim, and claims must stay true

Two comments in this codebase asserted behaviour the code did not have:

- `router.dart` promised a non-numeric book id would "fall through to the
  not-found page"; it rendered a "coming with #27" placeholder.
- `tappable_row.dart` states that every row "gets focus, keyboard activation
  and a semantic label for free" so it is not "invisible to a screen
  reader". Measured against a running build, the entire sidebar emits **no**
  accessibility DOM at all.

A comment describing behaviour is as much a deliverable as the code. When
you change behaviour, the comments above it are part of the diff. When you
write one, it must be something you have checked, not something you intend.

### A placeholder names a live issue and dies when that issue ships

`PendingScreen(title: 'Book', issue: '#27')` was correct when written and
became a lie the moment #27 merged — it told readers the book screen was
unbuilt while they were using it. A stand-in that outlives what it stood in
for is worse than a blank pane, because it is confidently wrong.

Closing an issue includes grepping for its number.

## Clean architecture

### A widget reads what it uses

`_Details` took ten constructor parameters. Four of them — the tag list, the
shelf list, the current user, the API — were read by its parent `_Loaded`
purely to hand down, making `_Loaded` depend on four things it never
touched. `_Details` is a `ConsumerWidget`; it can read them itself.

Thread a dependency through a parent only when the parent uses it. Riverpod
is in the tree precisely so intermediate widgets do not become couriers.

### Name a callback type that travels more than one level

`Future<void> Function(Future<void> Function())` appeared as a field on two
widgets. It is a function taking a function returning a future, and it is
unreadable at a call site. It is now `typedef BookWrite`.

### Never key a widget by state that widget's own output changes

The library mounted its search field with `key: ValueKey(filter.query)`. The
field is what *changes* the query, so every time its 300ms debounce fired,
the key changed and Flutter discarded the whole `State` — new
`TextEditingController`, new `FocusNode`, caret gone. Pausing mid-word, the
exact thing the debounce exists to permit, dropped the rest of the word on
the floor.

It also made the field's `didUpdateWidget` unreachable: a changed key means
a new `State`, never an update, so the guard written to reconcile
externally-changed filters had never once run.

A key is for telling instances apart. Reconciling incoming props is
`didUpdateWidget`'s job.

### The fake enforces the server's rules, including the awkward ones

`PUT /books/{id}/state` is a hybrid: `rating` and `progress` are a full
representation and default to zero when omitted, while `shelf_id` and
`tag_ids` are partial. The client sent only the rating, silently erasing
progress — and **no test caught it, because `FakeLibraApi` had the same
bug**. A fake that shares the client's misunderstanding tests nothing.

When an endpoint's semantics are surprising, the fake encodes the surprise.

## Testing

### Every widget gets at least one test

Both correctness bugs found in the milestone-28 review were in code the
suite never touched. `LibrarySearchField` — 264 lines, a debounce, an
autocomplete, a controller and a focus node — had **zero** tests.

Before starting a review or a milestone, list what has no coverage:

```bash
cd client && for f in lib/**/*.dart; do
  n=$(basename "$f" .dart); grep -rqi "$n" test/ || echo "untested: $f"
done
```

That list is where the bugs are.

### Assert what is on screen, not that nothing threw

The router test for a malformed book id asserted only
`expect(tester.takeException(), isNull)`. It passed for months while the
route rendered the wrong screen entirely. "Did not crash" is not a
behavioural assertion.

### Mutation-test every guard

Break it, watch the test fail, restore it. A passing test does not prove it
exercises the code path — the milestone-27 concurrency test passed with the
guard deleted, because `const` canonicalisation coalesced the notifications
it was watching. This convention predates this document; it is repeated here
because it is the only thing that catches a test asserting nothing.

### Probe before you fix

When you have a theory about a bug, write a throwaway test that *prints*
the actual behaviour before you believe it. The search-field diagnosis
turned on two printed lines — `same State object? false` and
`focus after debounce: false` — which converted a plausible story into a
measured fact and told us which of two candidate fixes was the real one.

Delete the probe once the real test exists.

### Verify accessibility claims against a build

Semantics annotations do not guarantee an accessibility tree. Every row in
the sidebar is wrapped in `Semantics(button: true)`; none of them reach the
DOM. That gap is invisible to `flutter test`, which reads the framework's
semantics rather than the rendered output.

If a change claims a11y behaviour, check it in a running build
(`scripts/run.sh --scratch`) before writing the claim down.
