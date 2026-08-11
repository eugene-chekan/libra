/// The real client, against a mock transport.
///
/// `FakeLibraApi` implements the same interface, so it proves the screens use
/// the API correctly — but it never encodes anything, which leaves the wire
/// format untested. That gap is not academic: "omit the key" and "send an
/// explicit null" mean different things to `exclude_unset` on the server, and
/// nothing above this layer can tell them apart.
///
/// This is what the injectable `client` on [HttpLibraApi] is for.
library;

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:libra_client/api/exceptions.dart';
import 'package:libra_client/api/http_libra_api.dart';

/// Captures the one request made, and answers with [body].
({HttpLibraApi api, List<http.BaseRequest> sent}) _client({
  String body = '{}',
  int status = 200,
  Map<String, String> headers = const {},
}) {
  final sent = <http.BaseRequest>[];
  final api = HttpLibraApi(
    baseUrl: 'http://backend',
    client: MockClient((request) async {
      sent.add(request);
      return http.Response(
        body,
        status,
        headers: {'content-type': 'application/json', ...headers},
      );
    }),
  );
  return (api: api, sent: sent);
}

Map<String, dynamic> _body(http.BaseRequest request) =>
    jsonDecode((request as http.Request).body) as Map<String, dynamic>;

void main() {
  group('setState distinguishes omitted from null', () {
    test('clearing a shelf sends an explicit null', () async {
      final t = _client(body: '{"id": 1, "title": "x", "author": "y"}');

      await t.api.setState(1, rating: 0, progress: 0, clearShelf: true);

      final body = _body(t.sent.single);
      expect(body.containsKey('shelf_id'), isTrue);
      expect(body['shelf_id'], isNull);
    });

    test('leaving the shelf alone omits the key entirely', () async {
      // Sending null here would silently unshelve a book on every rating
      // change, which is the bug this pair of tests exists to prevent.
      final t = _client(body: '{"id": 1, "title": "x", "author": "y"}');

      await t.api.setState(1, rating: 4, progress: 0.42);

      final body = _body(t.sent.single);
      expect(body.containsKey('shelf_id'), isFalse);
      expect(body['rating'], 4);
    });

    test('moving to a shelf sends the id', () async {
      final t = _client(body: '{"id": 1, "title": "x", "author": "y"}');

      await t.api.setState(1, rating: 0, progress: 0, shelfId: 7);

      expect(_body(t.sent.single)['shelf_id'], 7);
    });

    test('rating and progress always ride together', () async {
      // The endpoint is a PUT for these two: the server reads both off the
      // parsed body, where they default to zero. Sending only one silently
      // zeroes the other — which is how a rating click erased a reader's
      // progress the first time this screen met the real API.
      final t = _client(body: '{"id": 1, "title": "x", "author": "y"}');

      await t.api.setState(1, rating: 4, progress: 0.42);

      final body = _body(t.sent.single);
      expect(body['rating'], 4);
      expect(body['progress'], 0.42);
    });
  });

  group('listBooks builds the query the server expects', () {
    test('tags are a comma-separated id list', () async {
      final t = _client(body: '{"items": [], "total": 0}');

      await t.api.listBooks(query: 'dune', tagIds: [3, 7], shelfId: 2);

      final uri = t.sent.single.url;
      expect(uri.path, '/books');
      expect(uri.queryParameters['q'], 'dune');
      expect(uri.queryParameters['tags'], '3,7');
      expect(uri.queryParameters['shelf_id'], '2');
    });

    test('empty filters are omitted rather than sent blank', () async {
      final t = _client(body: '{"items": [], "total": 0}');

      await t.api.listBooks(query: '   ');

      final uri = t.sent.single.url;
      expect(uri.queryParameters.containsKey('q'), isFalse);
      expect(uri.queryParameters.containsKey('tags'), isFalse);
    });
  });

  group('status codes become typed exceptions', () {
    test('401', () async {
      final t = _client(body: '{"detail": "Not authenticated"}', status: 401);
      await expectLater(t.api.currentUser(), throwsA(isA<Unauthorized>()));
    });

    test('403', () async {
      final t = _client(body: '{"detail": "Admin required"}', status: 403);
      await expectLater(t.api.updateBook(1), throwsA(isA<Forbidden>()));
    });

    test('404', () async {
      final t = _client(body: '{"detail": "Book not found"}', status: 404);
      await expectLater(t.api.book(1), throwsA(isA<NotFound>()));
    });

    test('502 carries the reason, which Send to Kindle shows', () async {
      final t = _client(
        body: '{"detail": "The mail server refused the message"}',
        status: 502,
      );

      // A 502 is a ServerError; what matters is that the server's `detail`
      // survives, because Send to Kindle renders it as the failure reason.
      // The backend writes that string to be safe to show and keeps the SMTP
      // response — which quotes the username — in its log instead.
      await expectLater(
        t.api.sendToKindle(1),
        throwsA(
          isA<ServerError>().having(
            (e) => e.message,
            'message',
            'The mail server refused the message',
          ),
        ),
      );
    });

    test('a non-JSON body is a server error, not a crash', () async {
      final t = _client(
        body: '<html>502 Bad Gateway</html>',
        status: 502,
        headers: {'content-type': 'text/html'},
      );
      await expectLater(t.api.book(1), throwsA(isA<ServerError>()));
    });
  });

  group('download', () {
    test('takes the filename from Content-Disposition', () async {
      // Without it the reader gets the stored UUID rather than the book.
      final t = _client(
        body: 'epub bytes',
        headers: {
          'content-disposition':
              'attachment; filename="Frank Herbert - Dune.epub"',
        },
      );

      final file = await t.api.downloadBook(1);

      expect(file.filename, 'Frank Herbert - Dune.epub');
      expect(file.bytes, isNotEmpty);
    });

    test('falls back to something usable when the header is absent', () async {
      final t = _client(body: 'epub bytes');

      expect((await t.api.downloadBook(9)).filename, 'book-9.epub');
    });
  });

  group('covers', () {
    test('a 404 means no cover, not an error', () async {
      // The ordinary answer for a book whose file declares none.
      final t = _client(body: '{"detail": "no cover"}', status: 404);

      expect(await t.api.coverBytes(1), isNull);
    });
  });
}
