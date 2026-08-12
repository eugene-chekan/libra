/// What the book detail screen reads.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../api/providers.dart';
import '../api/session_guard.dart';

final bookProvider = FutureProvider.family<Book, int>(
  (ref, id) => ref.watch(libraApiProvider).book(id),
  retry: noRetry,
);

final notesProvider = FutureProvider.family<List<Note>, int>(
  (ref, bookId) => ref.watch(libraApiProvider).listNotes(bookId),
  retry: noRetry,
);
