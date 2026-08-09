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

  /// `GET /shelves`.
  Future<List<Shelf>> listShelves();

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
