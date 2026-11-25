# The API that the client uses

The web client talks to one server: the Libra server (Python, FastAPI). This
page lists every call the client makes, the data it sends and gets back, and
real examples.

- **The full schema** is [`openapi.json`](openapi.json) in this folder: every
  address, every field and every type, in the OpenAPI 3 format. The server
  makes it from its own code.
- **An interactive page** (Swagger UI) with the same schema is live at
  [https://libra-production-7f573af6.up.railway.app/docs](https://libra-production-7f573af6.up.railway.app/docs), and at http://localhost:8000/docs on a server you run
  yourself. Each call can be tried there. A call that needs a session works
  after you sign in to the app in the same browser, because the page sends the
  same cookie.
- **The client's own types** for this data are in
  [`web/src/api/types.ts`](https://github.com/eugene-chekan/libra/blob/main/web/src/api/types.ts).
  The two services that call the API are
  [`HttpLibraApi.ts`](https://github.com/eugene-chekan/libra/blob/main/web/src/api/HttpLibraApi.ts)
  and
  [`HttpLibrarianService.ts`](https://github.com/eugene-chekan/libra/blob/main/web/src/librarian/HttpLibrarianService.ts).

The examples below come from the real server, run on a new, empty database
on 2026-11-24. Only long values are shortened, marked `…`.

## Rules for every call

| Rule | Detail |
|---|---|
| Address | The same server that gave the page. Every call starts with `/api`, except `GET /health` |
| Data | JSON in both directions, except the book upload (a file) and the Librarian reply (a stream of events) |
| Sign-in | `POST /api/auth/login` sets a cookie called `libra_session`. The browser sends it with every later call. The cookie is `HttpOnly`, so the client's own code cannot read it |
| Errors | An error answer has the body `{"detail": "a sentence"}`. A field that fails the server's type check gives status 422 with a list in `detail` instead |
| Status codes | 401: not signed in, or the session ended. 403: signed in, but not allowed (for example, a reader on an admin call). 404: the thing does not exist, or belongs to another reader. 409: a name already taken. 422: a wrong value |

## All calls

The "Method in the client" column names the method of `LibraApi` or
`LibrarianService` that makes the call.

### Accounts

| Call | Method in the client | Who | Sends | Gets |
|---|---|---|---|---|
| `POST /api/auth/login` | `login` | anybody | `{username, password}` | `User`, and the cookie |
| `POST /api/auth/logout` | `logout` | signed in | — | nothing (204) |
| `GET /api/auth/me` | `me` | signed in | — | `CurrentUser` |
| `GET /api/users` | `listUsers` | admin | — | `User[]` |
| `POST /api/users` | `createUser` | admin | `{username, password, is_admin}` | `User` |
| `PATCH /api/users/{id}` | `updateUser` | the user, or an admin | any of `{password, kindle_email, is_admin}` | `User` |
| `DELETE /api/users/{id}` | `deleteUser` | admin | — | nothing (204) |

### Books

| Call | Method in the client | Who | Sends | Gets |
|---|---|---|---|---|
| `GET /api/books` | `listBooks` | signed in | query: `q` (search text), `tag_ids`, `shelf_id`, `sort` (`title` or `added`) | `{items: Book[], total}` |
| `POST /api/books/upload` | `uploadBook` | signed in | the EPUB file, as `multipart/form-data` | `Book` (201) |
| `GET /api/books/{id}` | `getBook` | signed in | — | `Book` |
| `PATCH /api/books/{id}` | `updateBook` | admin | any of `{title, author, year, pages, blurb}` | `Book` |
| `DELETE /api/books/{id}` | `deleteBook` | admin | — | nothing (204) |
| `PUT /api/books/{id}/state` | `setBookState` | signed in | any of `{rating, progress, position, shelf_id, tag_ids}` | `Book` |
| `GET /api/books/{id}/file` | `fileUrl` (an address for the reader) | signed in | — | the EPUB file |
| `GET /api/books/{id}/cover` | `coverUrl` (an address for `<img>`) | signed in | — | a picture |
| `PUT /api/books/{id}/cover` | `setCover` | admin | a picture file | `Book` |
| `POST /api/books/{id}/cover/from-url` | `setCoverFromUrl` | admin | `{url}` | `Book` |
| `DELETE /api/books/{id}/cover` | `clearCover` | admin | — | `Book` |
| `POST /api/books/{id}/send-to-kindle` | `sendToKindle` | signed in | — | `{book_id, sent_to, attempted_at}` |
| `GET /api/books/{id}/notes` | `listNotes` | signed in | — | `Note[]`, only the caller's |
| `POST /api/books/{id}/notes` | `createNote` | signed in | `{text, page}` | `Note` (201) |
| `DELETE /api/notes/{id}` | `deleteNote` | the writer | — | nothing (204) |

### Shelves and tags

| Call | Method in the client | Who | Sends | Gets |
|---|---|---|---|---|
| `GET /api/shelves` | `listShelves` | signed in | — | `Shelf[]`: the caller's, and other people's public ones |
| `POST /api/shelves` | `createShelf` | signed in | `{name, visibility}` | `Shelf` |
| `PATCH /api/shelves/{id}` | `updateShelf` | the owner | any of `{name, visibility}` | `Shelf` |
| `DELETE /api/shelves/{id}` | `deleteShelf` | the owner | — | nothing (204) |
| `PUT /api/shelves/order` | `reorderShelves` | signed in | `{shelf_ids}` | `Shelf[]` |
| `GET /api/tags` | `listTags` | signed in | — | `Tag[]`: global tags and the caller's own |
| `POST /api/tags` | `createTag` | signed in; `?make_global=true` for an admin | `{name}` | `Tag` |
| `PATCH /api/tags/{id}` | `updateTag` | the owner; an admin for a global tag | `{name}` | `Tag` |
| `DELETE /api/tags/{id}` | `deleteTag` | the same | — | nothing (204) |

### The Librarian

| Call | Method in the client | Who | Sends | Gets |
|---|---|---|---|---|
| `GET /api/conversations/mine` | `getConversation` | signed in | — | `Conversation`. Made on the first call |
| `POST /api/conversations/{id}/messages` | `sendMessage` | the owner | `{content}` | a stream of events (`text/event-stream`) |

### Admin and service

| Call | Method in the client | Who | Gets |
|---|---|---|---|
| `GET /health` | `health` | anybody | `{status, version, build}`, for the version line in the sidebar |
| `GET /api/maintenance` | `getMaintenance` | admin | counts of files with no book, books with no file, expired sessions |
| `POST /api/maintenance/prune-sessions` | `pruneSessions` | admin | `{removed}` |
| `POST /api/maintenance/vacuum` | `vacuum` | admin | `{reclaimed_bytes}` |
| `DELETE /api/maintenance/orphans/{name}` | `deleteOrphan` | admin | nothing (204) |

## Data schemas

The main types, as the client declares them in
[`types.ts`](https://github.com/eugene-chekan/libra/blob/main/web/src/api/types.ts).
A type names the fields that the client reads. The server may send more, and
the client ignores the rest.

```ts
interface User {
  id: number
  username: string
  is_admin: boolean
  kindle_email: string | null
  created_at: string          // ISO 8601, UTC
}

interface Book {
  id: number
  title: string
  author: string
  format: string              // 'epub' today
  year: number | null
  blurb: string | null        // the description
  pages: number | null
  has_cover: boolean
  cover_version: string | null
  // The caller's own reading state for this book:
  rating: number              // 0 to 5; 0 = not rated
  progress: number            // 0 to 1
  position: string | null     // the exact place in the book (an EPUB CFI)
  shelf_id: number | null
  tag_ids: number[]
  last_sent_at: string | null // last "Send to Kindle"
}

interface BookList { items: Book[]; total: number }

interface Shelf {
  id: number
  owner_id: number
  owner_username: string
  name: string
  visibility: 'private' | 'public'
  book_count: number
  editable: boolean           // true when the caller may change it
}

interface Tag {
  id: number
  name: string
  owner_id: number | null     // null for a global tag
  is_global: boolean
  book_count: number
  editable: boolean
}

interface Note { id: number; book_id: number; text: string; page: number | null; created_at: string }

// The Librarian
interface Citation { book_id: number; title: string }

interface LibrarianMessage {
  id: number
  role: 'user' | 'librarian'
  content: string
  created_at: string
  meta: { citation?: Citation; tool_call?: { summary: string } }
}

interface Conversation { id: number; messages: LibrarianMessage[] }

// One event of the reply stream
type LibrarianEvent =
  | { type: 'tool_status'; status: 'searching'; label: string }
  | { type: 'tool_status'; status: 'done'; summary: string }
  | { type: 'token'; text: string }
  | { type: 'citation'; book_id: number; title: string }
  | { type: 'done'; message_id: number }
```

**Planned for Part 2 of the diploma.** A reply will cite up to three
passages, not one book. `meta.citation` becomes a list, and each item gets the
chapter title and a short excerpt. The client will read an old message with
one citation as a list of one, so old conversations keep working.

## Examples

### Sign in

```http
POST /api/auth/login
Content-Type: application/json

{"username": "anna", "password": "example-password"}
```

```http
HTTP/1.1 200 OK
Set-Cookie: libra_session=…; HttpOnly; Max-Age=1209600; Path=/; SameSite=lax

{
  "id": 1,
  "username": "anna",
  "is_admin": true,
  "kindle_email": null,
  "created_at": "2026-11-24T20:13:44.452239"
}
```

With a wrong password:

```http
HTTP/1.1 401 Unauthorized

{"detail": "Invalid username or password"}
```

The client shows "Incorrect username or password." and keeps the form filled.

### Search the library

```http
GET /api/books?q=hunting&sort=title
```

```http
HTTP/1.1 200 OK

{
  "items": [
    {
      "id": 1,
      "title": "Huntingtower",
      "author": "John Buchan",
      "format": "epub",
      "year": 1922,
      "blurb": "A retired grocer meets a princess in a Scottish village.",
      "pages": null,
      "has_cover": false,
      "cover_version": null,
      "rating": 0,
      "progress": 0.0,
      "position": null,
      "shelf_id": null,
      "tag_ids": [],
      "last_sent_at": null,
      …
    }
  ],
  "total": 1
}
```

### Rate a book and save the progress

```http
PUT /api/books/1/state
Content-Type: application/json

{"rating": 4, "progress": 0.35}
```

```http
HTTP/1.1 200 OK

{"id": 1, "title": "Huntingtower", "rating": 4, "progress": 0.35,
 "started_at": "2026-11-24T20:13:45.715547", "finished_at": null, …}
```

A rating out of range:

```http
PUT /api/books/1/state

{"rating": 9}
```

```http
HTTP/1.1 422 Unprocessable Entity

{"detail": [{"type": "less_than_equal", "loc": ["body", "rating"],
             "msg": "Input should be less than or equal to 5", "input": 9, "ctx": {"le": 5}}]}
```

The client never sends this: the five stars cannot give 9.

### A book that does not exist

```http
GET /api/books/999
```

```http
HTTP/1.1 404 Not Found

{"detail": "Book not found"}
```

The client shows "That is no longer there." with a "Try again" button.

### Ask the Librarian

First the client loads the reader's conversation. A new reader has an empty
one:

```http
GET /api/conversations/mine
```

```http
HTTP/1.1 200 OK

{"id": 1, "messages": []}
```

Then it sends the question. The answer is a stream: one event per `data:`
line, with an empty line after each one.

```http
POST /api/conversations/1/messages
Content-Type: application/json

{"content": "What should I read next?"}
```

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"type": "tool_status", "status": "searching", "label": "Searching your library…"}

data: {"type": "tool_status", "status": "done", "summary": "Searched your library · 1 book"}

data: {"type": "token", "text": "Based on what's "}

data: {"type": "token", "text": "in your library, "}

data: {"type": "token", "text": "Huntingtower looks like "}

data: {"type": "token", "text": "a good next "}

data: {"type": "token", "text": "read. "}

data: {"type": "citation", "book_id": 1, "title": "Huntingtower"}

data: {"type": "done", "message_id": 2}
```

After `done`, the client loads the conversation again. The reply is now a
saved message:

```json
{
  "id": 2,
  "role": "librarian",
  "content": "Based on what's in your library, Huntingtower looks like a good next read.",
  "created_at": "2026-11-24T20:14:04.486394",
  "meta": {
    "tool_call": {"summary": "Searched your library · 1 book"},
    "citation": {"book_id": 1, "title": "Huntingtower"}
  }
}
```

**Today this reply is fixed text.** The server picks a book from the library
and fills a template. Part 2 of the diploma replaces it with the passages that
search finds.

### The session has ended

```http
GET /api/auth/me
```

```http
HTTP/1.1 401 Unauthorized

{"detail": "Not authenticated"}
```

Every 401 goes to one handler in the client. It ends the session on the
client side and opens the login page with the message that the session has
ended.
