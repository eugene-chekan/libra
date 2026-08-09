/// The library screen end to end, through the router, because the filter *is*
/// the route — asserting on it any other way would test a different thing than
/// the one that ships.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/exceptions.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/models.dart';
import 'package:libra_client/library/book_card.dart';

import '../helpers.dart';

const _dune = Book(
  id: 1,
  title: 'Dune',
  author: 'Frank Herbert',
  format: 'epub',
  tagIds: [10],
  progress: 0.42,
);
const _emma = Book(
  id: 2,
  title: 'Emma',
  author: 'Jane Austen',
  format: 'epub',
  tagIds: [11],
  progress: 1,
  rating: 4,
);
const _ulysses = Book(
  id: 3,
  title: 'Ulysses',
  author: 'James Joyce',
  format: 'epub',
  shelfId: 5,
);

const _scifi = Tag(id: 10, name: 'scifi', bookCount: 1);
const _classics = Tag(id: 11, name: 'classics', bookCount: 1);
const _toRead = Shelf(id: 5, name: 'To Read', ownerId: 1, editable: true);

FakeLibraApi _library() => FakeLibraApi(
  signedIn: true,
  books: [_dune, _emma, _ulysses],
  tags: [_scifi, _classics],
  shelves: [_toRead],
);

void main() {
  group('the grid', () {
    testWidgets('renders a card per book', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library');

      expect(find.byType(BookCard), findsNWidgets(3));
      // The title appears twice per card — once on the gradient standing in for
      // a cover, once on the line beneath it.
      expect(find.text('Dune'), findsNWidgets(2));
      expect(find.text('Frank Herbert'), findsOneWidget);
    });

    testWidgets('opens a book', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library');

      // Sorted by title, so the first card is Dune.
      await tester.tap(find.byType(BookCard).first);
      await pumpUntilSessionKnown(tester);

      expect(find.text('Book arrives with #27.'), findsOneWidget);
    });
  });

  group('the status line has exactly three shapes', () {
    testWidgets('in progress shows a bar and a percentage', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library');

      expect(find.text('42%'), findsOneWidget);
    });

    testWidgets('finished shows stars, not a full bar', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library');

      final stars = find.descendant(
        of: find.ancestor(
          of: find.text('Emma'),
          matching: find.byType(BookCard),
        ),
        matching: find.byIcon(Icons.star),
      );
      expect(stars, findsNWidgets(4));
    });

    testWidgets('untouched says so', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library');

      expect(find.text('Not started'), findsOneWidget);
    });
  });

  group('filters reach the server', () {
    testWidgets('a shelf in the URL is sent as shelf_id', (tester) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library?shelf=5');

      expect(api.lastQuery?.shelfId, 5);
      expect(find.byType(BookCard), findsOneWidget);
      expect(find.text('Ulysses'), findsWidgets);
    });

    testWidgets('tags in the URL are sent as a list', (tester) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library?tags=10,11');

      // OR, not AND: a book carrying either tag matches.
      expect(api.lastQuery?.tagIds, [10, 11]);
      expect(find.byType(BookCard), findsNWidgets(2));
    });

    testWidgets('a query is sent as q', (tester) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library?q=dune');

      expect(api.lastQuery?.query, 'dune');
      expect(find.byType(BookCard), findsOneWidget);
    });

    testWidgets('shelf and tags combine', (tester) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library?shelf=5&tags=10');

      // The shelf ANDs against the tag OR, which is the whole reason the two
      // pills are styled differently.
      expect(api.lastQuery?.shelfId, 5);
      expect(api.lastQuery?.tagIds, [10]);
    });
  });

  group('the filter summary', () {
    testWidgets('names the shelf and the tags', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library?shelf=5&tags=10');

      expect(find.text('To Read'), findsWidgets);
      expect(find.text('scifi'), findsOneWidget);
    });

    testWidgets('gives no OR hint for a single tag', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library?tags=10');
      expect(find.text('(OR)'), findsNothing);
    });

    testWidgets('hints OR once for the group, not per pill', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library?tags=10,11');
      expect(find.text('(OR)'), findsOneWidget);
    });

    testWidgets('clearing everything returns to the plain library', (
      tester,
    ) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library?shelf=5&tags=10');

      await tester.tap(find.text('Clear'));
      await pumpUntilSessionKnown(tester);

      expect(api.lastQuery?.shelfId, isNull);
      expect(api.lastQuery?.tagIds, isEmpty);
      expect(find.byType(BookCard), findsNWidgets(3));
    });
  });

  group('the sidebar filters', () {
    testWidgets('a shelf click filters rather than opening a page', (
      tester,
    ) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library');

      // The prototype's handler ignored its argument entirely; this is gap 4's
      // correction, so it is asserted on what was actually sent.
      await tester.tap(find.text('To Read'));
      await pumpUntilSessionKnown(tester);

      expect(api.lastQuery?.shelfId, 5);
      expect(find.text('Shelves arrives with #28.'), findsNothing);
    });

    testWidgets('a tag click toggles it', (tester) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library');

      await tester.tap(find.text('#scifi'));
      await pumpUntilSessionKnown(tester);
      expect(api.lastQuery?.tagIds, [10]);
      expect(find.byType(BookCard), findsOneWidget);

      await tester.tap(find.text('#scifi'));
      await pumpUntilSessionKnown(tester);
      // Back to the unfiltered list. Asserted on the result rather than on a
      // fresh request: that filter was already fetched, and being served from
      // cache is exactly why booksProvider is keyed by the filter.
      expect(find.byType(BookCard), findsNWidgets(3));
    });
  });

  group('empty and error states', () {
    testWidgets('an empty library offers the one thing to do', (tester) async {
      await pumpApp(tester, api: FakeLibraApi(signedIn: true), at: '/library');

      expect(find.text('Your library is empty'), findsOneWidget);
      expect(find.text('Add an EPUB to get started.'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Add Book'), findsOneWidget);
    });

    testWidgets('a search that matched nothing says only that', (tester) async {
      // Telling someone with 400 books and a typo to "add an EPUB to get
      // started" would be absurd.
      await pumpApp(tester, api: _library(), at: '/library?q=nothingmatches');

      expect(find.text('No books match your search.'), findsOneWidget);
      expect(find.text('Your library is empty'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Add Book'), findsNothing);
    });

    testWidgets('a failure is reported where the books would be', (
      tester,
    ) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library');
      // Persistent, not one-shot: Riverpod retries a failed provider by itself,
      // so a single failure resolves before it can ever be seen. That is the
      // right behaviour for a blip and the wrong one for this test.
      api.failAlwaysWith = const NetworkFailure();

      await tester.tap(find.text('#scifi'));
      await pumpUntilSessionKnown(tester);

      // Where the books would have been, never as a toast.
      expect(find.text('Could not reach the library server.'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      expect(find.byType(BookCard), findsNothing);
    });
  });
}
