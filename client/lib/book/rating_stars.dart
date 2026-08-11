/// The rating, which writes the moment it is clicked.
///
/// Rating is per-reader state, not shared catalog, so there is nothing to
/// agree with anyone about and no reason to make someone open a form and press
/// Save to say they liked a book. Clicking the star you already gave clears the
/// rating, because otherwise four stars is a decision you cannot take back.
library;

import 'package:flutter/material.dart';

import '../theme/tokens.dart';

class RatingStars extends StatefulWidget {
  const RatingStars({
    required this.rating,
    required this.onRate,
    this.size = 20,
    super.key,
  });

  final int rating;

  /// 0 clears it.
  final ValueChanged<int> onRate;

  final double size;

  @override
  State<RatingStars> createState() => _RatingStarsState();
}

class _RatingStarsState extends State<RatingStars> {
  int? _hovered;

  @override
  Widget build(BuildContext context) {
    // Hovering previews the rating that clicking would set, which is the only
    // way to tell "three stars" from "three stars, and I meant it".
    final shown = _hovered ?? widget.rating;

    return Semantics(
      label: widget.rating == 0
          ? 'Not rated'
          : '${widget.rating} out of 5 stars',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (var star = 1; star <= 5; star++)
            MouseRegion(
              cursor: SystemMouseCursors.click,
              onEnter: (_) => setState(() => _hovered = star),
              onExit: (_) => setState(() => _hovered = null),
              child: GestureDetector(
                onTap: () => widget.onRate(star == widget.rating ? 0 : star),
                child: Padding(
                  padding: const EdgeInsets.only(right: 2),
                  child: Icon(
                    star <= shown ? Icons.star : Icons.star_border,
                    size: widget.size,
                    color: star <= shown
                        ? LibraColors.accent
                        : LibraColors.border,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
