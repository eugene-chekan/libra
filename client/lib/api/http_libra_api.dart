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
