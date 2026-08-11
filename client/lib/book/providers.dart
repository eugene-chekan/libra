/// What the book detail screen reads.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../api/session_guard.dart';

/// Retry is off for the same reason it is off on the library: the design
/// specifies an error block with a "Try again" button, and an invisible
/// automatic retry racing it means the reader cannot tell whether their click
/// did anything.
Duration? _noRetry(int attempt, Object error) => null;

final bookProvider = FutureProvider.family<Book, int>(
  (ref, id) => ref.watch(libraApiProvider).book(id),
  retry: _noRetry,
);

final notesProvider = FutureProvider.family<List<Note>, int>(
  (ref, bookId) => ref.watch(libraApiProvider).listNotes(bookId),
  retry: _noRetry,
);
