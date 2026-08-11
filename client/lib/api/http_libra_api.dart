/// The real client: JSON in, typed objects out, status codes translated once.
///
/// Every request funnels through [_send] so that the mapping from status code
/// to exception exists in exactly one place. A 401 handled per call site is how
/// an app ends up with five different session-expiry behaviours, only three of
/// which redirect.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

import 'exceptions.dart';
import 'libra_api.dart';
import 'models.dart';

class HttpLibraApi implements LibraApi {
  HttpLibraApi({required this.baseUrl, required this.client});

  /// Where the backend lives, e.g. `http://localhost:8000`. No trailing slash.
  final String baseUrl;

  /// Injected rather than constructed here: on web it must be the
  /// `withCredentials` [BrowserClient], and leaving it a parameter is also what
  /// lets a test drive this class with `MockClient` to check status-code
  /// translation without a server.
  final http.Client client;

  void close() => client.close();

  @override
  Future<CurrentUser> login({
    required String username,
    required String password,
  }) async {
    final body = await _send(
      'POST',
      '/auth/login',
      body: {'username': username, 'password': password},
    );
    return CurrentUser.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<void> logout() => _send('POST', '/auth/logout');

  @override
  Future<CurrentUser> currentUser() async {
    final body = await _send('GET', '/auth/me');
    return CurrentUser.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<CurrentUser> updateUser(int id, {String? kindleEmail}) async {
    final body = await _send(
      'PATCH',
      '/users/$id',
      // Sent explicitly, including as an explicit null: the backend treats an
      // absent key as "leave unchanged", so clearing an address has to be a
      // present null rather than an omission.
      body: {'kindle_email': kindleEmail},
    );
    return CurrentUser.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<BookPage> listBooks({
    String? query,
    List<int> tagIds = const [],
    int? shelfId,
    String sort = 'title',
  }) async {
    final body =
        await _send(
              'GET',
              '/books',
              query: {
                if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
                if (tagIds.isNotEmpty) 'tags': tagIds.join(','),
                if (shelfId != null) 'shelf_id': '$shelfId',
                'sort': sort,
              },
            )
            as Map<String, dynamic>;

    return BookPage(
      items: [
        ...?(body['items'] as List?)?.map(
          (e) => Book.fromJson(e as Map<String, dynamic>),
        ),
      ],
      total: body['total'] as int? ?? 0,
    );
  }

  @override
  Future<List<Tag>> listTags() async {
    final body = await _send('GET', '/tags') as List;
    return [for (final e in body) Tag.fromJson(e as Map<String, dynamic>)];
  }

  @override
  Future<List<Shelf>> listShelves() async {
    final body = await _send('GET', '/shelves') as List;
    return [for (final e in body) Shelf.fromJson(e as Map<String, dynamic>)];
  }

  @override
  Future<Shelf> createShelf({
    required String name,
    bool isPublic = false,
  }) async {
    final body = await _send(
      'POST',
      '/shelves',
      body: {'name': name, 'visibility': isPublic ? 'public' : 'private'},
    );
    return Shelf.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<Shelf> updateShelf(int id, {String? name, bool? isPublic}) async {
    final body = await _send(
      'PATCH',
      '/shelves/$id',
      body: {
        'name': ?name,
        if (isPublic != null) 'visibility': isPublic ? 'public' : 'private',
      },
    );
    return Shelf.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<void> deleteShelf(int id) => _send('DELETE', '/shelves/$id');

  @override
  Future<List<Shelf>> reorderShelves(List<int> shelfIds) async {
    final body =
        await _send('PUT', '/shelves/order', body: {'shelf_ids': shelfIds})
            as List;
    return [for (final e in body) Shelf.fromJson(e as Map<String, dynamic>)];
  }

  @override
  Future<Book> book(int id) async =>
      Book.fromJson(await _send('GET', '/books/$id') as Map<String, dynamic>);

  @override
  Future<Book> setState(
    int id, {
    required int rating,
    required double progress,
    int? shelfId,
    bool clearShelf = false,
    List<int>? tagIds,
  }) async {
    final body = await _send(
      'PUT',
      '/books/$id/state',
      body: {
        // Always both: the server defaults an omitted one to zero rather than
        // leaving it, so a partial send is a silent erase.
        'rating': rating,
        'progress': progress,
        // Present-and-null is what clears the shelf; an absent key means
        // "leave it alone". `exclude_unset` server-side is what tells them
        // apart, so the two cases must not collapse here.
        if (clearShelf) 'shelf_id': null else 'shelf_id': ?shelfId,
        'tag_ids': ?tagIds,
      },
    );
    return Book.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<Book> updateBook(
    int id, {
    String? title,
    String? author,
    int? year,
    int? pages,
    String? blurb,
  }) async {
    final body = await _send(
      'PATCH',
      '/books/$id',
      body: {
        'title': ?title,
        'author': ?author,
        'year': ?year,
        'pages': ?pages,
        'blurb': ?blurb,
      },
    );
    return Book.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<KindleDelivery> sendToKindle(int id) async {
    final body = await _send('POST', '/books/$id/send-to-kindle');
    return KindleDelivery.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<List<Note>> listNotes(int bookId) async {
    final body = await _send('GET', '/books/$bookId/notes') as List;
    return [for (final e in body) Note.fromJson(e as Map<String, dynamic>)];
  }

  @override
  Future<Note> createNote(int bookId, {required String text, int? page}) async {
    final body = await _send(
      'POST',
      '/books/$bookId/notes',
      body: {'text': text, 'page': ?page},
    );
    return Note.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<Note> updateNote(int noteId, {String? text, int? page}) async {
    final body = await _send(
      'PATCH',
      '/notes/$noteId',
      body: {'text': ?text, 'page': ?page},
    );
    return Note.fromJson(body as Map<String, dynamic>);
  }

  @override
  Future<void> deleteNote(int noteId) => _send('DELETE', '/notes/$noteId');

  @override
  Future<DownloadedFile> downloadBook(int id) async {
    final http.Response response;
    try {
      response = await client.get(Uri.parse('$baseUrl/books/$id/file'));
    } on Exception {
      throw const NetworkFailure();
    }
    _throwForStatus(response.statusCode, null);

    return DownloadedFile(
      bytes: response.bodyBytes,
      filename:
          _filenameFrom(response.headers['content-disposition']) ??
          'book-$id.epub',
    );
  }

  /// Pulls the name out of `attachment; filename="Frank Herbert - Dune.epub"`.
  ///
  /// Without it the reader gets the stored UUID, since `file_path` is a
  /// generated name rather than anything they would recognise.
  static String? _filenameFrom(String? header) {
    if (header == null) return null;
    final quoted = RegExp('filename="([^"]+)"').firstMatch(header);
    if (quoted != null) return quoted.group(1);
    final bare = RegExp(r'filename=([^;]+)').firstMatch(header);
    return bare?.group(1)?.trim();
  }

  @override
  Future<Uint8List?> coverBytes(int bookId) async {
    final http.Response response;
    try {
      response = await client.get(Uri.parse('$baseUrl/books/$bookId/cover'));
    } on Exception {
      throw const NetworkFailure();
    }

    // A 404 is the ordinary answer for a book whose file declares no cover, so
    // it is null rather than an error. A 401 still has to reach the session.
    if (response.statusCode == 404) return null;
    _throwForStatus(response.statusCode, null);
    return response.bodyBytes;
  }

  /// Sends the request and returns the decoded body, or throws.
  ///
  /// Returns `null` for 204, which `/auth/logout` answers with.
  Future<Object?> _send(
    String method,
    String path, {
    Map<String, Object?>? body,
    Map<String, String>? query,
  }) async {
    var uri = Uri.parse('$baseUrl$path');
    if (query != null && query.isNotEmpty) {
      uri = uri.replace(queryParameters: query);
    }
    final request = http.Request(method, uri);
    if (body != null) {
      request.headers['content-type'] = 'application/json';
      request.body = jsonEncode(body);
    }

    final http.Response response;
    try {
      response = await http.Response.fromStream(await client.send(request));
    } on Exception {
      // A blocked CORS preflight surfaces here, indistinguishable from the
      // server being down — the browser deliberately withholds the detail.
      throw const NetworkFailure();
    }

    if (response.statusCode == 204 || response.body.isEmpty) {
      _throwForStatus(response.statusCode, null);
      return null;
    }

    Object? decoded;
    try {
      decoded = jsonDecode(response.body);
    } on FormatException {
      throw const ServerError('The server sent a response that was not JSON.');
    }

    _throwForStatus(response.statusCode, decoded);
    return decoded;
  }

  void _throwForStatus(int status, Object? decoded) {
    if (status >= 200 && status < 300) return;

    // FastAPI puts the message in `detail`, which is a string for a plain
    // HTTPException and a list for a validation error.
    final detail = decoded is Map<String, dynamic> ? decoded['detail'] : null;
    final message = detail is String ? detail : null;

    throw switch (status) {
      401 => Unauthorized(message ?? 'Not authenticated'),
      403 => Forbidden(message ?? 'Admin privileges required'),
      404 => NotFound(message ?? 'Not found'),
      >= 500 => ServerError(message ?? 'The server failed to handle that.'),
      _ => BadRequest(
        message ?? 'That request was rejected.',
        statusCode: status,
      ),
    };
  }
}
