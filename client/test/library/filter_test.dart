/// The filter is the URL, so these are the rules that make a filtered view
/// linkable and survive a reload.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/library/filter.dart';

void main() {
  group('toLocation', () {
    test('an empty filter is the plain route', () {
      expect(const LibraryFilter().toLocation(), '/library');
    });

    test('carries query, tags and shelf', () {
      const filter = LibraryFilter(query: 'dune', tagIds: [3, 7], shelfId: 2);
      final uri = Uri.parse(filter.toLocation());

      expect(uri.path, '/library');
      expect(uri.queryParameters['q'], 'dune');
      expect(uri.queryParameters['tags'], '3,7');
      expect(uri.queryParameters['shelf'], '2');
    });

    test('omits empty values rather than sending blanks', () {
      const filter = LibraryFilter(query: '   ', tagIds: []);
      expect(filter.toLocation(), '/library');
    });
  });

  group('fromQueryParameters', () {
    test('round-trips', () {
      const original = LibraryFilter(query: 'dune', tagIds: [3, 7], shelfId: 2);
      final restored = LibraryFilter.fromQueryParameters(
        Uri.parse(original.toLocation()).queryParameters,
      );

      expect(restored.query, 'dune');
      expect(restored.tagIds, [3, 7]);
      expect(restored.shelfId, 2);
    });

    test('drops junk rather than throwing', () {
      // These values come from the address bar, where anyone can type anything.
      // A malformed link should degrade to a broader view, not an error screen.
      final filter = LibraryFilter.fromQueryParameters({
        'tags': '3,notanumber,,7',
        'shelf': 'nope',
      });

      expect(filter.tagIds, [3, 7]);
      expect(filter.shelfId, isNull);
    });

    test('deduplicates repeated tag ids', () {
      final filter = LibraryFilter.fromQueryParameters({'tags': '3,3,7'});
      expect(filter.tagIds, [3, 7]);
    });
  });

  group('toggleTag', () {
    test('adds then removes', () {
      const filter = LibraryFilter();
      final on = filter.toggleTag(4);
      expect(on.tagIds, [4]);
      expect(on.toggleTag(4).tagIds, isEmpty);
    });

    test('keeps the others — tags OR, so several can be on at once', () {
      const filter = LibraryFilter(tagIds: [1, 2, 3]);
      expect(filter.toggleTag(2).tagIds, [1, 3]);
    });
  });

  test('isSearching distinguishes the two empty states', () {
    expect(const LibraryFilter().isSearching, isFalse);
    expect(const LibraryFilter(query: 'x').isSearching, isTrue);
    expect(const LibraryFilter(tagIds: [1]).isSearching, isTrue);
    expect(const LibraryFilter(shelfId: 1).isSearching, isTrue);
  });

  test('equality ignores tag order, so the cache key is stable', () {
    // booksProvider is keyed by this; treating [1,2] and [2,1] as different
    // filters would fetch the same list twice.
    expect(
      const LibraryFilter(tagIds: [1, 2]),
      const LibraryFilter(tagIds: [2, 1]),
    );
    expect(
      const LibraryFilter(tagIds: [1, 2]).hashCode,
      const LibraryFilter(tagIds: [2, 1]).hashCode,
    );
  });
}
