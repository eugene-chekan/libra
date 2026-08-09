/// One book in the grid: cover, title, author, and a one-line status.
///
/// The cover lifts on hover — `coverRest` to `coverHover` over 200ms — which is
/// the only motion on this screen and the thing that makes a wall of covers
/// feel like objects rather than a table.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import 'providers.dart';

class BookCard extends StatefulWidget {
  const BookCard({required this.book, required this.onTap, super.key});

  final Book book;
  final VoidCallback onTap;

  @override
  State<BookCard> createState() => _BookCardState();
}

class _BookCardState extends State<BookCard> {
  bool _hovered = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final lifted = _hovered || _focused;
    final book = widget.book;

    return Semantics(
      button: true,
      label: '${book.title} by ${book.author}',
      child: FocusableActionDetector(
        mouseCursor: SystemMouseCursors.click,
        onShowHoverHighlight: (v) => setState(() => _hovered = v),
        onShowFocusHighlight: (v) => setState(() => _focused = v),
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              widget.onTap();
              return null;
            },
          ),
        },
        child: GestureDetector(
          onTap: widget.onTap,
          behavior: HitTestBehavior.opaque,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: AnimatedContainer(
                  duration: LibraDurations.coverLift,
                  curve: Curves.easeOut,
                  transform: Matrix4.translationValues(0, lifted ? -4 : 0, 0),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(LibraRadius.cover),
                    boxShadow: lifted
                        ? LibraShadows.coverHover
                        : LibraShadows.coverRest,
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(LibraRadius.cover),
                    child: AspectRatio(
                      aspectRatio: LibraLayout.coverAspect,
                      child: _Cover(book: book),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                book.title,
                style: LibraText.cardTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Text(
                book.author,
                style: LibraText.metadataSmall,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 6),
              BookStatusLine(book: book),
            ],
          ),
        ),
      ),
    );
  }
}

/// The real cover, or the gradient that stands in for one.
class _Cover extends ConsumerWidget {
  const _Cover({required this.book});

  final Book book;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // `has_cover` comes down with the list precisely so a grid does not fire a
    // request per book that 404s on first paint.
    if (!book.hasCover) return CoverFallback(book: book);

    return ref
        .watch(coverProvider(book.id))
        .when(
          data: (bytes) => bytes == null
              ? CoverFallback(book: book)
              : Image.memory(bytes, fit: BoxFit.cover),
          // The gradient rather than a spinner: it is the same size and colour
          // family as the image that replaces it, so the swap is a crossfade
          // rather than a layout event.
          loading: () => CoverFallback(book: book),
          error: (_, _) => CoverFallback(book: book),
        );
  }
}

/// A deterministic gradient standing in for a missing cover.
///
/// Derived from the title so the same book always gets the same colours —
/// a reader learns the shape of their own shelf, and a fallback that reshuffled
/// on every load would destroy that. Hue only; saturation and lightness are
/// fixed to keep every fallback within the palette's range rather than letting
/// a hash pick something fluorescent.
class CoverFallback extends StatelessWidget {
  const CoverFallback({required this.book, super.key});

  final Book book;

  @override
  Widget build(BuildContext context) {
    final hue = _hueFor(book.title.isEmpty ? book.author : book.title);
    final top = HSLColor.fromAHSL(1, hue, 0.28, 0.62).toColor();
    final bottom = HSLColor.fromAHSL(1, (hue + 24) % 360, 0.32, 0.40).toColor();

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [top, bottom],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Align(
          alignment: Alignment.bottomLeft,
          child: Text(
            book.title,
            maxLines: 4,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontFamily: LibraFonts.serif,
              fontSize: 15,
              height: 1.2,
              color: LibraColors.card,
            ),
          ),
        ),
      ),
    );
  }

  static double _hueFor(String seed) {
    var hash = 0;
    for (final unit in seed.codeUnits) {
      hash = (hash * 31 + unit) & 0x7fffffff;
    }
    return (hash % 360).toDouble();
  }
}

/// The card's third line, which is one of exactly three things.
///
/// In progress wins over finished, and finished over not started, because a
/// book being read is the most actionable state and the reader's eye is
/// scanning for it.
class BookStatusLine extends StatelessWidget {
  const BookStatusLine({required this.book, super.key});

  final Book book;

  @override
  Widget build(BuildContext context) {
    if (book.isInProgress) {
      return Row(
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: book.progress.clamp(0, 1),
                minHeight: 3,
                backgroundColor: LibraColors.border,
                valueColor: const AlwaysStoppedAnimation(LibraColors.accent),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${(book.progress * 100).round()}%',
            style: LibraText.metadataSmall,
          ),
        ],
      );
    }

    if (book.isFinished) {
      return Semantics(
        label: book.rating > 0 ? '${book.rating} out of 5' : 'Finished',
        child: Row(
          children: [
            for (var i = 1; i <= 5; i++)
              Icon(
                i <= book.rating ? Icons.star : Icons.star_border,
                size: 12,
                color: i <= book.rating
                    ? LibraColors.accent
                    : LibraColors.border,
              ),
          ],
        ),
      );
    }

    return Text('Not started', style: LibraText.metadataSmall);
  }
}
