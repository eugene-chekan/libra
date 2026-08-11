/// The API surface, as an interface.
///
/// An interface rather than a concrete class with a swappable inner `Client`
/// because the fake then has to satisfy *this* — a Dart type — instead of
/// impersonating HTTP. Tests get a real object with real behaviour and no
/// socket, and `flutter test` never needs a backend running.
///
/// It carries only what milestone 3 needs. Books, shelves, tags and notes
/// arrive with the milestones that render them; a client method with no caller
/// is a guess about a screen that has not been built.
library;

import 'dart:typed_data';

import 'models.dart';

abstract interface class LibraApi {
  /// `POST /auth/login`. Throws [Unauthorized] on bad credentials — which the
  /// login screen renders as one non-specific message, never as "no such user".
  ///
  /// Returns the signed-in reader. The session cookie is set by the browser
  /// from the response's `Set-Cookie`; nothing here ever sees the token, which
  /// is the point of it being `httponly`.
  Future<CurrentUser> login({
    required String username,
    required String password,
  });

  /// `POST /auth/logout`. Revokes the session server-side, not just in the
  /// browser — clearing the cookie alone would leave a token that still works
  /// for anyone who captured it.
  Future<void> logout();

  /// `GET /auth/me`. Throws [Unauthorized] when there is no live session,
  /// which is how a cold load discovers whether the reader is signed in.
  Future<CurrentUser> currentUser();

  /// `PATCH /users/{id}`. Used by milestone 3 only for the Kindle address;
  /// #31 reuses it for the admin's per-row commits.
  Future<CurrentUser> updateUser(int id, {String? kindleEmail});

  /// `GET /books`.
  ///
  /// The filter semantics are the server's and are not negotiable here:
  /// [tagIds] **OR** each other, and [query] **ANDs** against that result,
  /// matching title or author case-insensitively. [shelfId] ANDs too. The
  /// client's whole job is to merge the sidebar selection and any typed `#tag`
  /// tokens into the single list this takes.
  Future<BookPage> listBooks({
    String? query,
    List<int> tagIds,
    int? shelfId,
    String sort,
  });

  /// `GET /tags`. Global tags plus this reader's own.
  Future<List<Tag>> listTags();

  /// `GET /shelves` — the caller's own in their chosen order, then others'
  /// public ones. **Trust that order**; re-sorting client-side would throw away
  /// the arrangement the reader chose.
  Future<List<Shelf>> listShelves();

  /// `POST /shelves`.
  Future<Shelf> createShelf({required String name, bool isPublic});

  /// `PATCH /shelves/{id}`. Omitted means unchanged.
  Future<Shelf> updateShelf(int id, {String? name, bool? isPublic});

  /// `DELETE /shelves/{id}`. The books stay in the library; only the placement
  /// goes.
  Future<void> deleteShelf(int id);

  /// `PUT /shelves/order` — the caller's complete order, in one call.
  ///
  /// Whole-list rather than per-row moves, which is what makes reordering one
  /// atomic decision instead of a race between rows.
  Future<List<Shelf>> reorderShelves(List<int> shelfIds);

  /// `GET /books/{id}`.
  Future<Book> book(int id);

  /// `PUT /books/{id}/state` — the caller's *own* rating, progress, shelf and
  /// personal tags. Always permitted: it touches nobody else's view.
  ///
  /// **[rating] and [progress] are required because the endpoint is a PUT for
  /// them.** The server reads both straight off the parsed body, where they
  /// default to zero, so omitting either *sets it to zero* — writing a rating
  /// without passing the current progress silently discards how far the reader
  /// had got. They are required here so that cannot be done by accident.
  ///
  /// [shelfId] and [tagIds] behave the other way round: the server guards both
  /// with `exclude_unset`, so omitting them leaves them alone, and [clearShelf]
  /// sends the explicit null that takes a book off its shelf. The endpoint is a
  /// hybrid; this signature is shaped to match it rather than to look tidy.
  Future<Book> setState(
    int id, {
    required int rating,
    required double progress,
    int? shelfId,
    bool clearShelf,
    List<int>? tagIds,
  });

  /// `PATCH /books/{id}` — the *shared* catalog: title, author, year, pages,
  /// blurb.
  ///
  /// **Admin only**, and the server enforces it. One reader's correction
  /// changes what everyone sees, which is the whole reason it is separated from
  /// [setState] rather than being one endpoint whose permissions depend on
  /// which keys the body happened to contain.
  Future<Book> updateBook(
    int id, {
    String? title,
    String? author,
    int? year,
    int? pages,
    String? blurb,
  });

  /// `POST /books/{id}/send-to-kindle`.
  ///
  /// No destination argument: the address is the caller's stored one and cannot
  /// be overridden per request, because an endpoint that mails an arbitrary
  /// file to an arbitrary address is an open relay wearing a library's clothes.
  Future<KindleDelivery> sendToKindle(int id);

  /// `GET /books/{id}/notes` — the caller's own, newest first.
  Future<List<Note>> listNotes(int bookId);

  /// `POST /books/{id}/notes`.
  Future<Note> createNote(int bookId, {required String text, int? page});

  /// `PATCH /notes/{id}`.
  Future<Note> updateNote(int noteId, {String? text, int? page});

  /// `DELETE /notes/{id}`.
  Future<void> deleteNote(int noteId);

  /// `GET /books/{id}/file`, with the filename the server chose.
  Future<DownloadedFile> downloadBook(int id);

  /// `GET /books/{id}/cover`, or null when the book has none.
  ///
  /// Returns bytes rather than a URL because the endpoint requires the session
  /// cookie, and a browser will not attach credentials to an `<img>` request
  /// against another origin — so `Image.network` silently 401s in exactly the
  /// dev setup the client runs in. Fetching through the credentialed client
  /// works regardless of where the API lives, and the response's
  /// `Cache-Control: private, max-age=86400` still gets honoured by the browser
  /// cache underneath.
  Future<Uint8List?> coverBytes(int bookId);
}

/// One page of `GET /books` — the items plus the unfiltered-by-paging total.
class BookPage {
  const BookPage({required this.items, required this.total});

  final List<Book> items;
  final int total;
}
