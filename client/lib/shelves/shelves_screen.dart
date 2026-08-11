/// The Shelves page: one block per shelf, in the reader's own order.
///
/// `GET /shelves` returns the caller's shelves in their chosen arrangement,
/// then other people's public ones. **That order is trusted, not re-sorted.**
/// Sorting client-side would quietly discard the one thing about this screen
/// the reader actually controls.
///
/// Shelves belonging to somebody else carry no edit affordances anywhere — not
/// a disabled pencil, not a greyed row. The server would refuse the write, and
/// a control that exists only to be refused is worse than no control.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/exceptions.dart';
import '../api/models.dart';
import '../library/filter.dart';
import '../library/providers.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/empty_state.dart';
import '../widgets/error_block.dart';
import '../widgets/page.dart';
import 'shelf_manager.dart';
import 'shelf_row.dart';

class ShelvesScreen extends ConsumerWidget {
  const ShelvesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final shelves = ref.watch(shelvesProvider);

    return LibraPage(
      title: 'Shelves',
      trailing: OutlinedButton(
        onPressed: () => showShelfManager(context),
        child: const Text('Manage Shelves'),
      ),
      child: shelves.when(
        loading: () => const SizedBox.shrink(),
        error: (error, _) => LibraErrorBlock(
          message: error is ApiException
              ? error.message
              : 'Could not load your shelves.',
          onRetry: () => ref.invalidate(shelvesProvider),
        ),
        data: (all) => _Shelves(shelves: all),
      ),
    );
  }
}

class _Shelves extends StatelessWidget {
  const _Shelves({required this.shelves});

  final List<Shelf> shelves;

  @override
  Widget build(BuildContext context) {
    final mine = shelves.where((s) => s.editable).toList();
    final shared = shelves.where((s) => !s.editable).toList();

    if (mine.isEmpty && shared.isEmpty) {
      return LibraEmptyState(
        title: 'No shelves yet',
        message: 'Shelves are your own arrangement of the library.',
        action: FilledButton(
          onPressed: () => showShelfManager(context),
          child: const Text('New Shelf'),
        ),
      );
    }

    return ListView(
      children: [
        for (final shelf in mine) ShelfBlock(shelf: shelf),
        // Hidden entirely when empty. On a single-user instance — the common
        // case — this section simply does not exist, rather than showing a
        // zero state explaining that nobody has shared anything.
        if (shared.isNotEmpty) ...[
          const SizedBox(height: 28),
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('SHARED WITH YOU', style: LibraText.sectionLabel),
          ),
          for (final shelf in shared) ShelfBlock(shelf: shelf),
        ],
      ],
    );
  }
}

/// One shelf: its name, how many books, and a row of their covers.
class ShelfBlock extends ConsumerWidget {
  const ShelfBlock({required this.shelf, super.key});

  final Shelf shelf;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = LibraryFilter(shelfId: shelf.id);
    final books = ref.watch(booksProvider(filter));

    return Padding(
      padding: const EdgeInsets.only(bottom: LibraSpace.shelfRowGap + 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Heading(shelf: shelf, onOpen: () => context.go(filter.toLocation())),
          const SizedBox(height: 12),
          SizedBox(
            height: 150,
            child: books.when(
              loading: () => const SizedBox.shrink(),
              error: (_, _) => Text(
                'Could not load these books.',
                style: LibraText.metadata,
              ),
              data: (page) => page.items.isEmpty
                  ? const _EmptyShelf()
                  : ShelfCoverRow(books: page.items),
            ),
          ),
        ],
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading({required this.shelf, required this.onOpen});

  final Shelf shelf;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        GestureDetector(
          onTap: onOpen,
          child: MouseRegion(
            cursor: SystemMouseCursors.click,
            child: Text(shelf.name, style: LibraText.shelfName),
          ),
        ),
        // "by {username}", so a shared shelf says whose it is. The name rides
        // on the shelf itself because listing users is admin-only.
        if (!shelf.editable && shelf.ownerUsername.isNotEmpty) ...[
          const SizedBox(width: 8),
          Text('· by ${shelf.ownerUsername}', style: LibraText.metadataSmall),
        ],
        if (shelf.isPublic) ...[const SizedBox(width: 8), const PublicPill()],
        const SizedBox(width: 10),
        Text(
          '${shelf.bookCount} ${shelf.bookCount == 1 ? 'book' : 'books'}',
          style: LibraText.metadataSmall,
        ),
      ],
    );
  }
}

/// Marks the shelf that is *not* the norm. Private is the default and the
/// common case, so labelling every private shelf would be noise — the asymmetry
/// is the point.
class PublicPill extends StatelessWidget {
  const PublicPill({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: LibraColors.accentLight,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.visibility_outlined,
            size: 12,
            color: LibraColors.accent,
          ),
          const SizedBox(width: 4),
          Text(
            'Public',
            style: LibraText.metadataSmall.copyWith(
              fontWeight: FontWeight.w600,
              color: LibraColors.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyShelf extends StatelessWidget {
  const _EmptyShelf();

  @override
  Widget build(BuildContext context) {
    return DottedBox(
      child: Center(
        child: Text('Nothing on this shelf yet.', style: LibraText.metadata),
      ),
    );
  }
}

/// A dashed container, the same idiom as the sidebar's Add Book button.
class DottedBox extends StatelessWidget {
  const DottedBox({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: LibraColors.border, width: 1.5),
        borderRadius: BorderRadius.circular(LibraRadius.standard),
      ),
      child: child,
    );
  }
}
