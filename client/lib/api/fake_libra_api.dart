/// An in-memory [LibraApi] with real behaviour and no socket.
///
/// It lives in `lib/` rather than `test/` on purpose: `flutter run` can be
/// pointed at it to build a screen before its endpoint exists, and #32's
/// stubbed librarian will need exactly this. It is also what makes "no test
/// needs a running backend" true rather than aspirational.
///
/// It enforces the rules the real server enforces — credentials must match, an
/// unauthenticated call throws [Unauthorized] — because a fake that says yes to
/// everything tests nothing.
library;

import 'dart:typed_data';

import 'exceptions.dart';
import 'libra_api.dart';
import 'models.dart';

class FakeLibraApi implements LibraApi {
  FakeLibraApi({
    CurrentUser? user,
    this.password = 'correct-horse',
    this.signedIn = false,
    List<Book>? books,
    List<Tag>? tags,
    List<Shelf>? shelves,
    this.covers = const {},
  }) : user =
           user ??
           const CurrentUser(
             id: 1,
             username: 'eugene',
             isAdmin: false,
             kindleSender: 'libra@example.com',
           ),
       books = books ?? [],
       tags = tags ?? [],
       shelves = shelves ?? [];

  CurrentUser user;
  List<Book> books;
  List<Tag> tags;
  List<Shelf> shelves;

  /// Book id → cover bytes. A book absent from this map has no cover, which is
  /// the 404 the real endpoint answers with.
  Map<int, Uint8List> covers;

  /// Records the arguments of the last [listBooks] call, so a test can assert
  /// what the client *sent* — the filter merge is the client's whole job here,
  /// and asserting on the rendered result would not distinguish "sent the right
  /// filter" from "filtered locally".
  ({String? query, List<int> tagIds, int? shelfId, String sort})? lastQuery;

  /// The one password [login] accepts. Anything else throws [Unauthorized],
  /// exactly as a wrong password and an unknown username both do server-side.
  final String password;

  /// Whether a session is live. Public and mutable so a test can start
  /// already signed in without going through [login].
  bool signedIn;

  /// Set to make the next call fail, so a test can drive the expiry path
  /// without unwinding the whole session. Cleared once thrown, so it models a
  /// single stale request rather than a permanently broken server.
  ApiException? failNextWith;

  /// Set to make *every* call fail until cleared.
  ///
  /// Needed because Riverpod retries a failed provider on its own: a one-shot
  /// failure is swallowed by the retry succeeding, which is the right
  /// behaviour for a blip but means a test of the error state has to model a
  /// server that is actually down.
  ApiException? failAlwaysWith;

  /// Every call, in order — lets a test assert that logout actually reached the
  /// server rather than only clearing local state.
  final calls = <String>[];

  /// Gate for the concurrency test: when set, calls await it before answering,
  /// so several requests can be genuinely in flight at once.
  Future<void>? gate;

  Future<T> _call<T>(String name, T Function() body) async {
    calls.add(name);
    if (gate != null) await gate;

    final failure = failAlwaysWith ?? failNextWith;
    if (failure != null) {
      if (failure == failNextWith) failNextWith = null;
      if (failure is Unauthorized) signedIn = false;
      throw failure;
    }
    return body();
  }

  void _requireSession() {
    if (!signedIn) throw const Unauthorized();
  }

  @override
  Future<CurrentUser> login({
    required String username,
    required String password,
  }) => _call('login', () {
    if (username.trim().toLowerCase() != user.username ||
        password != this.password) {
      // One exception for both cases, as the server gives one message for
      // both — the client must not be able to tell them apart either.
      throw const Unauthorized('Invalid username or password');
    }
    signedIn = true;
    return user;
  });

  @override
  Future<void> logout() => _call('logout', () {
    _requireSession();
    signedIn = false;
  });

  @override
  Future<CurrentUser> currentUser() => _call('currentUser', () {
    _requireSession();
    return user;
  });

  @override
  Future<CurrentUser> updateUser(int id, {String? kindleEmail}) =>
      _call('updateUser', () {
        _requireSession();
        if (id != user.id) throw const Forbidden();
        user = user.copyWith(
          kindleEmail: kindleEmail,
          clearKindleEmail: kindleEmail == null,
        );
        return user;
      });

  /// Applies the server's own semantics: tags **OR** each other, then `q` and
  /// `shelf_id` **AND** against that. A fake that ignored them would let a
  /// filter bug pass every test.
  @override
  Future<BookPage> listBooks({
    String? query,
    List<int> tagIds = const [],
    int? shelfId,
    String sort = 'title',
  }) => _call('listBooks', () {
    _requireSession();
    lastQuery = (query: query, tagIds: tagIds, shelfId: shelfId, sort: sort);

    final needle = query?.trim().toLowerCase();
    final matched = books.where((b) {
      if (tagIds.isNotEmpty && !tagIds.any(b.tagIds.contains)) return false;
      if (shelfId != null && b.shelfId != shelfId) return false;
      if (needle != null && needle.isNotEmpty) {
        final hay = '${b.title} ${b.author}'.toLowerCase();
        if (!hay.contains(needle)) return false;
      }
      return true;
    }).toList();

    matched.sort(
      sort == 'added'
          ? (a, b) => b.id.compareTo(a.id)
          : (a, b) => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
    );
    return BookPage(items: matched, total: matched.length);
  });

  @override
  Future<List<Tag>> listTags() => _call('listTags', () {
    _requireSession();
    return tags;
  });

  @override
  Future<List<Shelf>> listShelves() => _call('listShelves', () {
    _requireSession();
    return shelves;
  });

  @override
  Future<Uint8List?> coverBytes(int bookId) => _call('coverBytes', () {
    _requireSession();
    return covers[bookId];
  });

  Book _find(int id) {
    for (final book in books) {
      if (book.id == id) return book;
    }
    throw const NotFound('Book not found');
  }

  void _replace(Book book) {
    books = [
      for (final b in books)
        if (b.id == book.id) book else b,
    ];
  }

  @override
  Future<Book> book(int id) => _call('book', () {
    _requireSession();
    return _find(id);
  });

  @override
  Future<Book> setState(
    int id, {
    required int rating,
    required double progress,
    int? shelfId,
    bool clearShelf = false,
    List<int>? tagIds,
  }) => _call('setState', () {
    _requireSession();
    final current = _find(id);
    // Faithful to the endpoint's hybrid semantics: rating and progress are a
    // full representation and are always applied; shelf and tags are partial
    // and are left alone when not supplied. An earlier version of this fake
    // treated all four as partial, which made the client's matching bug
    // invisible to every test that used it.
    final updated = current.copyWith(
      rating: rating,
      progress: progress,
      shelfId: shelfId,
      clearShelf: clearShelf,
      tagIds: tagIds,
    );
    _replace(updated);
    return updated;
  });

  /// Admin only, as the server enforces: the catalog is shared, so one
  /// reader's correction changes what everyone sees.
  @override
  Future<Book> updateBook(
    int id, {
    String? title,
    String? author,
    int? year,
    int? pages,
    String? blurb,
  }) => _call('updateBook', () {
    _requireSession();
    if (!user.isAdmin) throw const Forbidden();
    final updated = _find(id).copyWith(
      title: title,
      author: author,
      year: year,
      pages: pages,
      blurb: blurb,
    );
    _replace(updated);
    return updated;
  });

  /// Set to make the next send fail, so the failure state can be driven without
  /// pretending the whole server is down.
  ApiException? kindleFailure;

  @override
  Future<KindleDelivery> sendToKindle(int id) => _call('sendToKindle', () {
    _requireSession();
    final book = _find(id);
    final failure = kindleFailure;
    if (failure != null) throw failure;
    // The server's own rule: no stored address, no send.
    if (user.kindleEmail == null) {
      throw const BadRequest(
        'Set your Kindle address before sending',
        statusCode: 422,
      );
    }
    final now = DateTime.fromMillisecondsSinceEpoch(clockMillis);
    _replace(book.copyWith(lastSentAt: now));
    return KindleDelivery(
      bookId: id,
      sentTo: user.kindleEmail,
      attemptedAt: now,
    );
  });

  /// A fixed clock. Tests assert on rendered relative times, and a real one
  /// would make those assertions depend on when they ran.
  int clockMillis = DateTime.utc(2026, 1, 1).millisecondsSinceEpoch;

  final _notes = <int, List<Note>>{};
  int _nextNoteId = 1;

  @override
  Future<List<Note>> listNotes(int bookId) => _call('listNotes', () {
    _requireSession();
    return [...?_notes[bookId]];
  });

  @override
  Future<Note> createNote(int bookId, {required String text, int? page}) =>
      _call('createNote', () {
        _requireSession();
        final note = Note(
          id: _nextNoteId++,
          bookId: bookId,
          text: text,
          page: page,
          createdAt: DateTime.fromMillisecondsSinceEpoch(clockMillis),
        );
        // Newest first, as the endpoint returns them.
        _notes.putIfAbsent(bookId, () => []).insert(0, note);
        return note;
      });

  @override
  Future<Note> updateNote(int noteId, {String? text, int? page}) =>
      _call('updateNote', () {
        _requireSession();
        for (final entry in _notes.entries) {
          for (var i = 0; i < entry.value.length; i++) {
            final note = entry.value[i];
            if (note.id != noteId) continue;
            final updated = Note(
              id: note.id,
              bookId: note.bookId,
              text: text ?? note.text,
              page: page ?? note.page,
              createdAt: note.createdAt,
            );
            entry.value[i] = updated;
            return updated;
          }
        }
        throw const NotFound('Note not found');
      });

  @override
  Future<void> deleteNote(int noteId) => _call('deleteNote', () {
    _requireSession();
    for (final list in _notes.values) {
      list.removeWhere((n) => n.id == noteId);
    }
  });

  @override
  Future<DownloadedFile> downloadBook(int id) => _call('downloadBook', () {
    _requireSession();
    final book = _find(id);
    return DownloadedFile(
      bytes: Uint8List.fromList('epub bytes for ${book.title}'.codeUnits),
      filename: '${book.author} - ${book.title}.epub',
    );
  });
}
