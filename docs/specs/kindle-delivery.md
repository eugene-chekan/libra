# Spec: Kindle Delivery

**Status:** Shipped in #15 (issue #6). Implemented as specified, in
`app/mailer.py` and `library.send_to_kindle`.

Verified end to end against a real Kindle: a public-domain EPUB sent through
Gmail's SMTP arrived on the device. That check is manual — the test suite
never opens a socket, by design.

Two things the real file confirmed: `pages` came back `NULL` (no
`schema:numberOfPages`, as predicted), and `year` parsed to the Gutenberg
transcription date rather than the publication year, because an unlabelled
`dc:date` is indistinguishable from a publication date. Admin-correctable.

The question that shaped this feature was settled on 2026-08-03: Send to
Kindle accepts EPUB directly, so nothing needs converting and
[format-conversion.md](format-conversion.md) is **not** a dependency. What
remains is an SMTP client and the constraints Amazon puts around it.

## Goal

Let a user send a book from the shared library to their own Kindle by email,
using one SMTP account configured for the whole instance.

## Scope

**In scope:**
- Instance-wide SMTP configuration — one account, shared by every user.
- Per-user `kindle_email`.
- `POST /books/{id}/send-to-kindle`.
- A size pre-check against Amazon's attachment ceiling.
- Recording that a send was attempted.
- Setup documentation for both halves: the admin configures SMTP, each user
  approves the sender address on their own Amazon account.

**Out of scope:**
- Per-user SMTP accounts — decided against, see
  [Configuration](#configuration--one-account-many-users).
- Managing the Amazon approved-sender list. There is no API for it; it is
  done by the user in their Amazon account settings and cannot be automated.
- Delivery confirmation. Not deferred — **impossible**, see below.
- Bulk send, scheduled send, retry queues.
- Conversion anywhere in the send path.

## What the API can honestly promise

This section constrains everything below it, so it comes first.

Amazon accepts personal documents only from addresses on the recipient's
**Approved Personal Document E-mail List**. Mail from any other address is
**silently discarded** — no bounce, no error, no status endpoint, no receipt.
Nothing downstream of the SMTP handoff is observable to libra.

Three consequences:

1. **The API can only report that the mail server accepted the message.** It
   must not say "delivered", and the client must not either. The gap between
   the two is real and users will land in it.
2. **`202 Accepted` is the honest status code.** `200 OK` would assert a
   completion the server cannot observe.
3. **The approved-list step is the most likely cause of "I sent it and
   nothing arrived"**, and it happens entirely outside libra. It has to be
   prominent in the setup documentation and visible in the product, not
   buried in a README section nobody reaches twice.

## Configuration — one account, many users

**Decided: a single instance-wide SMTP account, shared by every user.** A
household running one server has one mail account; per-user SMTP credentials
would multiply the secrets to protect and gain nobody anything.

```python
class Settings(BaseSettings):
    ...
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None              # the address users must approve
    smtp_starttls: bool = True
    smtp_timeout_seconds: int = 30
    kindle_max_attachment_bytes: int = 50 * 1024 * 1024
```

The per-user half is `User.kindle_email` plus the Amazon-side approval, which
each user manages themselves.

**The consequence worth stating plainly:** because every user's mail leaves
from the same `From:` address, **every user must add that one address to
their own approved list**. That is the good version of this constraint — one
address to document, approved once per person, no per-user configuration
inside libra at all.

That address is **not a secret** — it is precisely the string users must copy
into their Amazon account — so the API should hand it out. `GET /auth/me`
returns `smtp_from` (or `null` when unconfigured) so the client can render
the setup instruction with the real value rather than a placeholder.

`smtp_password` is the opposite: environment-only, never in a response body,
never in a log line, never in an error message. It reaches the process
through `LIBRA_SMTP_PASSWORD` and stops there.

When `smtp_host` or `smtp_from` is unset the feature is **disabled**, and the
endpoint returns `503` rather than failing obscurely at send time.

## Data model

- `User.kindle_email` — already specified in
  [library-organization.md](library-organization.md).
- `UserBookState.last_sent_at: datetime | None` — new nullable column,
  recording the last time this user sent this book. Enough for a "Sent to
  your Kindle 2 days ago" line without a delivery-log table, since
  `UserBookState` is already keyed on exactly `(user_id, book_id)`.

**Sequencing consequence:** this puts a soft dependency on the milestone that
creates `UserBookState`. Rather than add the column in a later migration,
[phase-1-plan.md](phase-1-plan.md#sequence) now runs reading state *before*
Kindle delivery. Kindle delivery is still fourth of eight, so it is in no
danger of being the milestone that gets squeezed — which was the reason it
was pulled forward in the first place.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/books/{id}/send-to-kindle` | Send the book to the caller's Kindle address |

**No request body.** The destination is the caller's stored `kindle_email`
and deliberately cannot be overridden per request: an endpoint that mails an
arbitrary file to an arbitrary address is an open relay wearing a library's
clothes, and the feature gains nothing from allowing it.

Response is `202` with what was attempted:

```json
{ "book_id": 12, "sent_to": "eugene_123@kindle.com", "attempted_at": "..." }
```

`attempted_at`, not `sent_at` — the field name should not claim more than the
system knows.

## Pipeline

Mirrors the ordering discipline of the upload path: check everything that can
be checked before doing anything with a side effect.

1. Book exists → `404` otherwise.
2. SMTP configured → `503` otherwise.
3. Caller has a `kindle_email` → `422` otherwise.
4. Resolve the file through `storage.resolve()` — **reuse the existing
   traversal guard**, do not write a second one.
5. Size check against the ceiling → `413` otherwise.
6. Build the message.
7. Send, with `smtp_timeout_seconds` enforced.
8. Record `last_sent_at` **only after** SMTP accepts.
9. Return `202`.

Step 8 is the same never-lie-about-state discipline the upload router already
follows: a failed send must not leave a record claiming the book went out.

## Message construction

- `To:` the caller's `kindle_email`; `From:` `smtp_from`.
- **Subject:** the book title. Amazon ignores it for EPUB — this is for the
  human later reading their own sent-mail folder. (Historically the subject
  `Convert` requested server-side conversion; irrelevant now.)
- **Body:** short non-empty text. Some servers treat a wholly empty body as
  suspicious.
- **Attachment:** `application/epub+zip`, with the filename **regenerated**
  as `{title} - {author}.epub`.

That last point is not cosmetic. Stored files are UUID names
(`{uuid4hex}.epub`) precisely so that client-supplied names never touch the
filesystem — but a Kindle showing `9f2c1a...epub` in its library would be a
bad outcome, so the human-readable name has to be reconstructed at send time
from the metadata.

Regenerating it reintroduces user-controlled text into a MIME header, so it
needs handling rather than interpolation: strip path separators and control
characters, collapse whitespace, cap the length, fall back to the stored name
if sanitizing leaves nothing, and encode non-ASCII per RFC 2231 rather than
emitting raw bytes into a header. `email.message.EmailMessage` does the
encoding correctly if given the filename as a parameter; hand-built headers
do not.

## The size limit

Send to Kindle caps attachments at roughly **50 MB**, while
`max_upload_bytes` defaults to **100 MB** ([`app/config.py`](../../backend/app/config.py)).
A book in that gap uploads cleanly and can never be sent, so the check has to
exist and has to produce a clear message rather than a mail-server rejection.

**Check the encoded size, not the file size.** MIME base64 inflates an
attachment by about 33%, so a 45 MB EPUB becomes roughly 60 MB on the wire.
Validating the raw file against a 50 MB ceiling would pass books the mail
server then refuses — the failure mode this check exists to prevent, arrived
at by a different route. Whether Amazon's published figure refers to the
document or the encoded message is worth confirming; until it is, compute
against the encoded size, which is the conservative reading.

## Error handling

| Condition | Response |
|---|---|
| Not authenticated | `401` |
| Book not found | `404` |
| SMTP not configured on the instance | `503` |
| Caller has no `kindle_email` set | `422` |
| Encoded attachment exceeds the ceiling | `413`, naming the limit |
| Stored file missing from disk | `500`, logged — a book row without its file is an integrity bug, not user error |
| SMTP authentication rejected | `502`, generic message; details server-side only |
| SMTP connection failure or timeout | `504` |

The `502`/`503` split follows the same logic as
[format-conversion.md](format-conversion.md)'s handling of a missing
`ebook-convert`: `503` means *this deployment is not set up for the feature*,
`502` means *it is set up and the upstream refused*. They call for different
fixes by different people, so they should not share a code.

Credential errors in particular must never echo the SMTP server's response
text to the client — it routinely contains the username.

## Testing strategy

**The seam is a `mailer` module** exposing `send_message()`, provided as a
FastAPI dependency and overridden in tests exactly the way `get_session` and
`get_settings` already are in [`tests/conftest.py`](../../backend/tests/conftest.py).
No network, no real SMTP, no new external dependency in CI.

Tests worth naming:

- Every precondition failure returns its code **and sends nothing** — assert
  the mailer was not called, not just the status.
- `last_sent_at` is recorded on success, and **is not** recorded when the
  mailer raises.
- Filename sanitization: titles containing `/`, `\`, control characters,
  non-ASCII, and a title that sanitizes to empty.
- The oversize check uses encoded size — a file just under the raw ceiling
  whose encoded form exceeds it must be rejected.
- **No SMTP credential appears in any response body**, for every error path.
  Cheap to assert exhaustively and exactly the kind of leak that arrives via
  a well-meaning "include the underlying error" change later.
- **Cross-user**: A's send goes to A's address and records against A's state
  row; A cannot cause a send to B's address.

Per the project's mutation-testing convention, break the size check and the
credential-redaction guard by hand once each to confirm their tests fail.

*Optional:* an `aiosmtpd` in-process server for one end-to-end test, skipped
by default. Worth it only if the message-construction tests prove too
indirect.

## Open questions

- **Synchronous send or `BackgroundTasks`?** A 20 MB attachment over a slow
  upstream link holds a worker for the duration. `BackgroundTasks` frees the
  request but discards the *only* signal that exists — SMTP acceptance —
  leaving the user with no feedback whatsoever on a feature whose downstream
  is already unobservable. Leaning synchronous for that reason, with the
  timeout as the bound. Revisit if real sends prove slow.
- **Rate limiting.** One shared SMTP account means one shared sending quota
  (Gmail, for instance, caps daily sends). A household is unlikely to hit it,
  but nothing currently stops a client from looping. Probably a later
  concern; noting it so it is a decision rather than an oversight.
- **Should libra proactively surface setup state?** A user whose sender
  address is not approved gets `202` and silence, forever. A "your Kindle
  setup looks incomplete" hint — shown when `kindle_email` is set but nothing
  has ever been sent — would help, but it is a guess dressed as a diagnosis.
  Needs design input.
- **The exact attachment ceiling**, and whether Amazon measures the document
  or the encoded message. Affects the default above.
