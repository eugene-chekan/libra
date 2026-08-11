/// The row of covers under a shelf's name.
///
/// Smaller than the library grid's cells and scrolled horizontally: a shelf is
/// a glance, not a browse. Reuses the grid's cover so a book looks like the
/// same book wherever it appears.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/models.dart';
import '../library/book_card.dart';
import '../library/providers.dart';
import '../theme/tokens.dart';

class ShelfCoverRow extends StatelessWidget {
  const ShelfCoverRow({required this.books, super.key});

  final List<Book> books;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: books.length,
      separatorBuilder: (_, _) => const SizedBox(width: 16),
      itemBuilder: (context, i) => _MiniCover(book: books[i]),
    );
  }
}

class _MiniCover extends ConsumerWidget {
  const _MiniCover({required this.book});

  final Book book;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = book.hasCover
        ? ref.watch(coverProvider(book.id)).value
        : null;

    return Semantics(
      button: true,
      label: '${book.title} by ${book.author}',
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: () => context.go('/books/${book.id}'),
          child: AspectRatio(
            aspectRatio: LibraLayout.coverAspect,
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(LibraRadius.cover),
                boxShadow: LibraShadows.coverRest,
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(LibraRadius.cover),
                child: bytes == null
                    ? CoverFallback(book: book)
                    : Image.memory(bytes, fit: BoxFit.cover),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
