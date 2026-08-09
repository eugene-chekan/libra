/// The sidebar's SHELVES and TAGS sections.
///
/// **A shelf click filters the library; it does not open the Shelves page.**
/// That is gap 4's correction: the prototype's handler ignored its argument
/// entirely, so clicking any shelf did the same nothing-in-particular. Making
/// both shelves and tags filters over one grid is what makes the sidebar
/// coherent — everything in it narrows the same view.
///
/// The SHARED WITH YOU section, the Shelves page and both manager modals are
/// #28 and #29. This is only the filtering half.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../library/filter.dart';
import '../library/providers.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/tappable_row.dart';

class SidebarFilters extends ConsumerWidget {
  const SidebarFilters({
    required this.filter,
    required this.onApply,
    super.key,
  });

  /// The filter as it currently stands, so a selected shelf or tag can be shown
  /// as active rather than the sidebar guessing.
  final LibraryFilter filter;

  final ValueChanged<LibraryFilter> onApply;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shelves = ref.watch(shelvesProvider).value ?? const <Shelf>[];
    final tags = ref.watch(tagsProvider).value ?? const <Tag>[];

    // Only this reader's own shelves here; other people's public ones get the
    // SHARED WITH YOU section in #28, which is a different heading for a reason.
    final own = shelves.where((s) => s.editable).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (own.isNotEmpty) ...[
          const SizedBox(height: 20),
          const _SectionLabel('SHELVES'),
          for (final shelf in own)
            _FilterRow(
              label: shelf.name,
              count: shelf.bookCount,
              selected: filter.shelfId == shelf.id,
              // Toggling off rather than only on: clicking the shelf you are
              // already inside is the obvious way to leave it.
              onTap: () => onApply(
                filter.shelfId == shelf.id
                    ? filter.copyWith(clearShelf: true)
                    : filter.copyWith(shelfId: shelf.id),
              ),
            ),
        ],
        if (tags.isNotEmpty) ...[
          const SizedBox(height: 20),
          const _SectionLabel('TAGS'),
          for (final tag in tags)
            _FilterRow(
              label: '#${tag.name}',
              count: tag.bookCount,
              selected: filter.tagIds.contains(tag.id),
              // Tags OR each other, so several can be on at once — which is
              // exactly why this toggles rather than replaces.
              onTap: () => onApply(filter.toggleTag(tag.id)),
            ),
        ],
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 12, bottom: 8),
    child: Text(text, style: LibraText.sectionLabel),
  );
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.label,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return LibraTappableRow(
      onTap: onTap,
      selected: selected,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: selected
                  ? LibraText.listRow.copyWith(
                      color: LibraColors.accent,
                      fontWeight: FontWeight.w600,
                    )
                  : LibraText.listRow,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text('$count', style: LibraText.metadataSmall),
        ],
      ),
    );
  }
}
