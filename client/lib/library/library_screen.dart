/// The library: a wall of covers, and the controls that narrow it.
///
/// Every filter change is a navigation. That is what makes a filtered view
/// linkable and the back button meaningful, and it means this screen holds no
/// filter state of its own — it renders whatever the route says.
///
/// Two empty states, deliberately distinct: a library with nothing in it is a
/// first-run experience with one thing to do, and a search that matched nothing
/// is a dead end you back out of. Telling someone "add an EPUB to get started"
/// when they have 400 books and a typo would be absurd.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/exceptions.dart';
import '../api/models.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/empty_state.dart';
import '../widgets/error_block.dart';
import '../widgets/page.dart';
import '../widgets/skeleton.dart';
import 'book_card.dart';
import 'filter.dart';
import 'filter_summary.dart';
import 'providers.dart';
import 'search_field.dart';

class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({required this.filter, super.key});

  final LibraryFilter filter;

  void _apply(BuildContext context, LibraryFilter next) =>
      context.go(next.toLocation());

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final books = ref.watch(booksProvider(filter));
    final tags = ref.watch(tagsProvider).value ?? const <Tag>[];
    final shelves = ref.watch(shelvesProvider).value ?? const <Shelf>[];

    return LibraPage(
      title: 'Library',
      trailing: LibrarySearchField(
        // Deliberately unkeyed. Keying this by the applied query rebuilt the
        // field from scratch every time the debounce fired — a new State, a new
        // FocusNode, and the caret gone mid-word after the 300ms pause the
        // debounce exists to allow. Reconciling stale text is the job of the
        // field's own `didUpdateWidget`, which a changing key made unreachable.
        query: filter.query,
        tags: tags,
        onQueryChanged: (q) => _apply(context, filter.copyWith(query: q)),
        onTagAdded: (tag) => _apply(context, filter.toggleTag(tag.id)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FilterSummary(
            shelf: shelves.where((s) => s.id == filter.shelfId).firstOrNull,
            tags: [
              for (final id in filter.tagIds)
                ?tags.where((t) => t.id == id).firstOrNull,
            ],
            onClearShelf: () =>
                _apply(context, filter.copyWith(clearShelf: true)),
            onRemoveTag: (id) => _apply(context, filter.toggleTag(id)),
            onClearAll: () => _apply(context, const LibraryFilter()),
          ),
          Expanded(
            child: books.when(
              loading: () => const LibraDeferred(
                child: SingleChildScrollView(child: LibraCoverGridSkeleton()),
              ),
              error: (error, _) => LibraErrorBlock(
                message: _messageFor(error),
                onRetry: () => ref.invalidate(booksProvider(filter)),
              ),
              data: (page) => page.items.isEmpty
                  ? _Empty(searching: filter.isSearching)
                  : _Grid(
                      books: page.items,
                      onOpen: (book) => context.go('/books/${book.id}'),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

/// `auto-fill minmax(160px, 1fr)` with a 28px gap, which is the CSS the design
/// specifies. [SliverGridDelegateWithMaxCrossAxisExtent] is the closest Flutter
/// equivalent: it fits as many columns as it can at or under the maximum, which
/// is what `auto-fill` does from the other direction.
class _Grid extends StatelessWidget {
  const _Grid({required this.books, required this.onOpen});

  final List<Book> books;
  final ValueChanged<Book> onOpen;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      padding: const EdgeInsets.only(bottom: 28),
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: LibraLayout.libraryCellMin * 1.6,
        crossAxisSpacing: LibraSpace.libraryGridGap,
        mainAxisSpacing: LibraSpace.libraryGridGap,
        // The cover's 1.45 plus the three text lines beneath it.
        childAspectRatio: 0.52,
      ),
      itemCount: books.length,
      itemBuilder: (context, i) =>
          BookCard(book: books[i], onTap: () => onOpen(books[i])),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.searching});

  final bool searching;

  @override
  Widget build(BuildContext context) {
    if (searching) {
      // One line, as the handoff specified. Nothing to offer: the reader has to
      // change what they asked for, and the pills above already show what that
      // is.
      return Center(
        child: Text(
          'No books match your search.',
          style: LibraText.body.copyWith(color: LibraColors.textLight),
        ),
      );
    }

    return LibraEmptyState(
      title: 'Your library is empty',
      message: 'Add an EPUB to get started.',
      // Solid accent here alone, unlike the sidebar's dashed button: it is the
      // only thing to do on this screen.
      action: FilledButton(
        // Upload is #30; until then this is the same inert affordance the
        // sidebar's is, rather than a button that lies about what it does.
        onPressed: () {},
        child: const Text('Add Book'),
      ),
    );
  }
}

/// The API layer already translated the status code into a typed exception with
/// a sentence a reader can act on, so use it rather than inventing a second
/// vocabulary here.
String _messageFor(Object error) =>
    error is ApiException ? error.message : 'Could not load your library.';
