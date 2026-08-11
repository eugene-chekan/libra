/// Routes every 401 into the session, once, whatever the call was.
///
/// A decorator rather than a check at each call site. "Any 401 from any
/// request expires the session" is a property of the application, and the only
/// way to keep it true as milestones 4–12 add call sites is to make it
/// impossible to bypass: feature code gets [libraApiProvider], which is this
/// wrapper, and never the raw client.
///
/// [SessionController.expire] is what actually dedupes — this only has to
/// report. Three parallel requests failing together call `expire()` three
/// times and produce one state change, hence one redirect.
library;

import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../session/session.dart';
import 'exceptions.dart';
import 'libra_api.dart';
import 'models.dart';
import 'providers.dart';

class SessionAwareApi implements LibraApi {
  SessionAwareApi({required this.inner, required this.onUnauthorized});

  /// The real client. Public so a test can assert this wrapper delegates
  /// rather than reimplements.
  final LibraApi inner;

  /// Called for every 401 that is not a rejected sign-in.
  final void Function() onUnauthorized;

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on Unauthorized {
      onUnauthorized();
      rethrow;
    }
  }

  /// **Not guarded.** A 401 here means the credentials were wrong, not that a
  /// session ended — expiring on it would be nonsense, and on the login screen
  /// it would fight the redirect that put the reader there.
  @override
  Future<CurrentUser> login({
    required String username,
    required String password,
  }) => inner.login(username: username, password: password);

  /// **Not guarded**, for the same reason in reverse: logging out of an already
  /// dead session is a success from the reader's point of view, and
  /// [SessionController.signOut] is clearing the state regardless.
  @override
  Future<void> logout() => inner.logout();

  @override
  Future<CurrentUser> currentUser() => _guard(inner.currentUser);

  @override
  Future<CurrentUser> updateUser(int id, {String? kindleEmail}) =>
      _guard(() => inner.updateUser(id, kindleEmail: kindleEmail));

  @override
  Future<BookPage> listBooks({
    String? query,
    List<int> tagIds = const [],
    int? shelfId,
    String sort = 'title',
  }) => _guard(
    () => inner.listBooks(
      query: query,
      tagIds: tagIds,
      shelfId: shelfId,
      sort: sort,
    ),
  );

  @override
  Future<List<Tag>> listTags() => _guard(inner.listTags);

  @override
  Future<List<Shelf>> listShelves() => _guard(inner.listShelves);

  @override
  Future<Uint8List?> coverBytes(int bookId) =>
      _guard(() => inner.coverBytes(bookId));

  @override
  Future<Shelf> createShelf({required String name, bool isPublic = false}) =>
      _guard(() => inner.createShelf(name: name, isPublic: isPublic));

  @override
  Future<Shelf> updateShelf(int id, {String? name, bool? isPublic}) =>
      _guard(() => inner.updateShelf(id, name: name, isPublic: isPublic));

  @override
  Future<void> deleteShelf(int id) => _guard(() => inner.deleteShelf(id));

  @override
  Future<List<Shelf>> reorderShelves(List<int> shelfIds) =>
      _guard(() => inner.reorderShelves(shelfIds));

  @override
  Future<Book> book(int id) => _guard(() => inner.book(id));

  @override
  Future<Book> setState(
    int id, {
    required int rating,
    required double progress,
    int? shelfId,
    bool clearShelf = false,
    List<int>? tagIds,
  }) => _guard(
    () => inner.setState(
      id,
      rating: rating,
      progress: progress,
      shelfId: shelfId,
      clearShelf: clearShelf,
      tagIds: tagIds,
    ),
  );

  @override
  Future<Book> updateBook(
    int id, {
    String? title,
    String? author,
    int? year,
    int? pages,
    String? blurb,
  }) => _guard(
    () => inner.updateBook(
      id,
      title: title,
      author: author,
      year: year,
      pages: pages,
      blurb: blurb,
    ),
  );

  @override
  Future<KindleDelivery> sendToKindle(int id) =>
      _guard(() => inner.sendToKindle(id));

  @override
  Future<List<Note>> listNotes(int bookId) =>
      _guard(() => inner.listNotes(bookId));

  @override
  Future<Note> createNote(int bookId, {required String text, int? page}) =>
      _guard(() => inner.createNote(bookId, text: text, page: page));

  @override
  Future<Note> updateNote(int noteId, {String? text, int? page}) =>
      _guard(() => inner.updateNote(noteId, text: text, page: page));

  @override
  Future<void> deleteNote(int noteId) => _guard(() => inner.deleteNote(noteId));

  @override
  Future<DownloadedFile> downloadBook(int id) =>
      _guard(() => inner.downloadBook(id));
}

/// What every screen from milestone 4 onwards uses.
///
/// The session controller itself deliberately reads [apiProvider] instead: its
/// cold-load probe treats a 401 as "not signed in", and routing that through
/// here would report an expiry for someone who simply is not logged in.
final libraApiProvider = Provider<LibraApi>(
  (ref) => SessionAwareApi(
    inner: ref.watch(apiProvider),
    onUnauthorized: () => ref.read(sessionProvider.notifier).expire(),
  ),
);
