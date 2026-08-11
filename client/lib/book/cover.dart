/// The detail screen's cover, and the lightbox behind it.
///
/// Reuses the grid's gradient fallback rather than drawing a second one: a book
/// without a cover should look like the same book here as it does in the
/// library, and two independent hash-to-colour functions would eventually
/// disagree.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../library/book_card.dart';
import '../library/providers.dart';
import '../theme/tokens.dart';

class BookCover extends ConsumerWidget {
  const BookCover({required this.book, this.width = 200, super.key});

  final Book book;
  final double width;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = book.hasCover
        ? ref.watch(coverProvider(book.id)).value
        : null;

    final image = ClipRRect(
      borderRadius: BorderRadius.circular(LibraRadius.cover),
      child: AspectRatio(
        aspectRatio: LibraLayout.coverAspect,
        child: bytes == null
            ? CoverFallback(book: book)
            : Image.memory(bytes, fit: BoxFit.cover),
      ),
    );

    return SizedBox(
      width: width,
      child: Semantics(
        button: bytes != null,
        label: bytes != null ? 'Enlarge cover' : null,
        child: MouseRegion(
          // Only a real cover is worth enlarging; a gradient has no detail to
          // show, so offering the gesture would promise something.
          cursor: bytes == null ? MouseCursor.defer : SystemMouseCursors.zoomIn,
          child: GestureDetector(
            onTap: bytes == null
                ? null
                : () => showDialog<void>(
                    context: context,
                    barrierColor: const Color(0xCC000000),
                    builder: (_) => _Lightbox(bytes: bytes, book: book),
                  ),
            child: DecoratedBox(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(LibraRadius.cover),
                boxShadow: LibraShadows.coverRest,
              ),
              child: image,
            ),
          ),
        ),
      ),
    );
  }
}

class _Lightbox extends StatelessWidget {
  const _Lightbox({required this.bytes, required this.book});

  final Uint8List bytes;
  final Book book;

  @override
  Widget build(BuildContext context) {
    // Dismisses on a tap anywhere and on Escape, which `showDialog` already
    // handles — a lightbox that traps you is a lightbox nobody opens twice.
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Dialog(
        backgroundColor: Colors.transparent,
        elevation: 0,
        insetPadding: const EdgeInsets.all(48),
        child: Semantics(
          label: 'Cover of ${book.title}',
          child: Image.memory(bytes, fit: BoxFit.contain),
        ),
      ),
    );
  }
}
