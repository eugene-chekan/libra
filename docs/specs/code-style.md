# Spec: Code Style and Clean Architecture

**Status:** Adopted as a rule for new work, not scheduled as a refactor.
Nothing here requires rewriting existing code.

Linters and formatters (`ruff`, ESLint, `tsc`) are a hard gate but catch none
of what follows. These rules have to be read, not run.

## Code style

### One decision lives in one place

If two files need the same decision — a policy, a constant, a default — the
decision moves up into one shared place, not sideways into a second copy.
Two copies drift: one gets updated, the other doesn't, and nothing points out
the mismatch.

### Do not hand-roll what the SDK already gives you

Before writing a helper, check whether the language or framework already has
it. Two spellings of one operation force a reader to check whether they
differ.

### Tests import constants; they never transcribe them

A test that copies a value instead of importing it drifts the moment the
value changes — the test keeps passing against a number that no longer means
anything. Import the constant. If importing it feels wrong, that's a sign the
constant lives in the wrong place, not that the test should copy it.

### One line, and the parameters

**A docstring is one line.** It says what the thing is or does, and stops.
Making it longer needs a reason you could defend out loud, not a feeling that
the reader might like the background.

**In Python, document the parameters too** — an `Args:` section, one short
phrase each, plus `Returns:` and `Raises:` where either is worth knowing. That
is interface documentation: it tells a caller what to pass. Route handlers are
the exception, because their parameters are framework wiring (`Depends(...)`)
and the real interface is the request and response models, which are typed.

**In TypeScript, the types already document the parameters.** A one-line
summary, and a short line per field on an exported interface where the name
does not carry it. Nothing else.

**A comment inside a function is the last resort.** Ask whether the code can
say it — a rename, an extracted function — before writing one. What survives
is a genuine surprise the reader cannot deduce: a browser quirk, an endpoint
that behaves unlike its siblings.

Everything else is garbage:

- **Narrative history.** "This used to return the row", "found by the client
  in #65", "the prototype drew it differently". Git holds that, and
  `docs/specs/` holds the parts worth keeping.
- **Alternatives considered.** A design decision belongs in `docs/specs/`,
  once, where somebody looking for design decisions will find it.
- **Reassurance.** "Verified, not assumed." The reader cannot check any of
  it, and it makes a file longer for nothing.

Prose is not free. It goes stale, it has to be reviewed, and a wall of it
trains the reader to skip the lot — including the line that mattered.

### A comment is a claim, and claims must stay true

A comment describing behaviour is as much a deliverable as the code. When you
change behaviour, the comments above it are part of the diff. When you write
one, it must describe something you have checked, not something you intend.

### A placeholder names a live issue and dies when that issue ships

A stand-in that outlives what it stood in for is worse than a blank pane,
because it is confidently wrong. Closing an issue includes grepping for its
number.

## Clean architecture

### A component reads what it uses

Thread a dependency through a parent only when the parent itself uses it.
Otherwise the component that needs the data reads it directly — from
context, a hook, or its own props — instead of making an intermediate
component a courier for four things it never touches.

### Name a callback type that travels more than one level

A function type repeated as a field on two or more components is unreadable
at a call site. Give it a name.

### Never key a component by state that component's own output changes

A key is for telling instances apart. If a component's own output (a
debounced value, a derived string) feeds back into its own key, every update
destroys and recreates the component — losing focus, cursor position, and any
local state — instead of updating in place. Reconciling incoming props is a
lifecycle hook's job, not the key's.

### The fake enforces the server's rules, including the awkward ones

When an endpoint's semantics are surprising — a hybrid full/partial update,
a field that defaults on omission — the test fake must encode that surprise
too. A fake that shares the client's misunderstanding of the API tests
nothing.

## Testing

### Every component gets at least one test

Before starting a review or a milestone, list what has no coverage. An
untested component is where the next bug is.

### Assert what is on screen, not that nothing threw

"Did not crash" is not a behavioural assertion. A test must check the actual
rendered output or return value, not just the absence of an exception.

### Mutation-test every guard

Break it, watch the test fail, restore it. A passing test does not prove it
exercises the code path it claims to guard — the only way to know is to
break the guard and confirm the test actually fails.

### Probe before you fix

When you have a theory about a bug, write a throwaway test that *prints* the
actual behaviour before you believe it. A printed fact turns a plausible
story into a measured one, and tells you which of several candidate fixes is
the real one. Delete the probe once the real test exists.

### Verify accessibility claims against a build

Markup that looks accessible does not guarantee an accessible tree — a
framework's own testing utilities can pass while the rendered DOM has no
accessibility tree at all. If a change claims a11y behaviour, check it in a
running build (`scripts/run.sh --scratch` or `scripts/run.ps1 -Scratch`)
before writing the claim down.
