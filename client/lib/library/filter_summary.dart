/// What the library is filtered to, shown as removable pills.
///
/// **The shelf pill is deliberately not styled like a tag pill.** A shelf ANDs
/// with everything else; tags OR each other. Two controls that look identical
/// and behave differently are worse than no pills at all — so the shelf reads
/// as a container (solid `accentLight` with a shelf icon, first in the row) and
/// tags read as labels (outlined, grouped, with a single "(OR)" hint after the
/// group rather than repeated on each one).
library;

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';

class FilterSummary extends StatelessWidget {
  const FilterSummary({
    required this.shelf,
    required this.tags,
    required this.onClearShelf,
    required this.onRemoveTag,
    required this.onClearAll,
    super.key,
  });

  /// Null when no shelf filter is applied, or when the id does not resolve to
  /// a shelf this reader can see — a stale link should not render a blank pill.
  final Shelf? shelf;

  final List<Tag> tags;
  final VoidCallback onClearShelf;
  final ValueChanged<int> onRemoveTag;
  final VoidCallback onClearAll;

  @override
  Widget build(BuildContext context) {
    if (shelf == null && tags.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          if (shelf != null)
            _Pill(
              label: shelf!.name,
              icon: Icons.collections_bookmark_outlined,
              filled: true,
              onRemove: onClearShelf,
            ),
          for (final tag in tags)
            _Pill(
              label: tag.name,
              filled: false,
              onRemove: () => onRemoveTag(tag.id),
            ),
          // One hint for the group, not one per pill: it describes the
          // relationship between them, and repeating it would imply otherwise.
          if (tags.length > 1) Text('(OR)', style: LibraText.metadataSmall),
          TextButton(onPressed: onClearAll, child: const Text('Clear')),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.filled,
    required this.onRemove,
    this.icon,
  });

  final String label;
  final bool filled;
  final VoidCallback onRemove;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.only(left: 10, right: 4, top: 4, bottom: 4),
      decoration: BoxDecoration(
        color: filled ? LibraColors.accentLight : LibraColors.card,
        borderRadius: BorderRadius.circular(LibraRadius.pill),
        border: Border.all(
          color: filled ? LibraColors.accentLight : LibraColors.border,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: LibraColors.accent),
            const SizedBox(width: 6),
          ],
          Text(
            label,
            style: TextStyle(
              fontFamily: LibraFonts.sans,
              fontSize: 12,
              fontWeight: filled ? FontWeight.w600 : FontWeight.w400,
              color: filled ? LibraColors.accent : LibraColors.textMid,
            ),
          ),
          const SizedBox(width: 2),
          IconButton(
            onPressed: onRemove,
            icon: const Icon(Icons.close, size: 12),
            color: LibraColors.textLight,
            splashRadius: 12,
            constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
            padding: EdgeInsets.zero,
            tooltip: 'Remove $label',
          ),
        ],
      ),
    );
  }
}
