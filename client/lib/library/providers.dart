/// What the library screen reads.
///
/// Books are keyed by the filter, so navigating between two filtered views and
/// back does not refetch, and two widgets asking for the same filter share one
/// request. Tags and shelves are fetched once and shared: the sidebar, the
/// autocomplete and the filter pills all need to turn an id into a name, and
/// three independent fetches of the same list would be three chances to
/// disagree.
library;

import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/libra_api.dart';
import '../api/models.dart';
import '../api/providers.dart';
import '../api/session_guard.dart';
import 'filter.dart';

final booksProvider = FutureProvider.family<BookPage, LibraryFilter>((
  ref,
  filter,
) {
  return ref
      .watch(libraApiProvider)
      .listBooks(
        query: filter.query,
        tagIds: filter.tagIds,
        shelfId: filter.shelfId,
      );
}, retry: noRetry);

final tagsProvider = FutureProvider<List<Tag>>(
  (ref) => ref.watch(libraApiProvider).listTags(),
  retry: noRetry,
);

final shelvesProvider = FutureProvider<List<Shelf>>(
  (ref) => ref.watch(libraApiProvider).listShelves(),
  retry: noRetry,
);

/// Cover bytes for one book, cached for as long as something is watching.
///
/// One request per book, as the plan notes; if the grid ever feels slow this is
/// the first thing to look at. Only requested when `has_cover` is true, so a
/// library of cover-less EPUBs costs nothing.
final coverProvider = FutureProvider.family<Uint8List?, int>(
  (ref, bookId) => ref.watch(libraApiProvider).coverBytes(bookId),
  retry: noRetry,
);
