/// One book: what it is, where you are in it, and what you can do with it.
///
/// **Two kinds of write live on this screen, and they behave differently on
/// purpose.** Rating, shelf placement and progress are the reader's own state —
/// nobody else sees them, so they commit the moment they are changed and there
/// is nothing to confirm. Title, author, year, pages and blurb are the shared
/// catalog: one correction changes what everyone sees, so they sit behind an
/// explicit edit mode with Save and Cancel. The endpoint split mirrors this
/// exactly, and `PATCH /books/{id}` is admin-only, which is why Edit Book
/// appears only for an admin rather than opening a form that cannot be saved.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../api/exceptions.dart';
import '../api/http_client_factory.dart';
import '../api/models.dart';
import '../api/session_guard.dart';
import '../library/filter.dart';
import '../library/providers.dart';
import '../session/session.dart';
import '../shell/kindle_email_modal.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/error_block.dart';
import '../widgets/skeleton.dart';
import 'action_row.dart';
import 'book_edit_form.dart';
import 'cover.dart';
import 'notes_panel.dart';
import 'providers.dart';
import 'rating_stars.dart';

class BookScreen extends ConsumerStatefulWidget {
  const BookScreen({required this.bookId, super.key});

  final int bookId;

  @override
  ConsumerState<BookScreen> createState() => _BookScreenState();
}

/// Runs a write and reports its failure on the page.
///
/// Named because the bare type — a function taking a function returning a
/// future — is unreadable at a call site, and it is passed down two levels.
typedef BookWrite = Future<void> Function(Future<void> Function() action);

class _BookScreenState extends ConsumerState<BookScreen> {
  bool _editing = false;
  String? _actionError;

  /// Re-reads the book and, because a shelf or tag change moves it in the
  /// grid, the library behind it.
  void _refresh() {
    ref.invalidate(bookProvider(widget.bookId));
    ref.invalidate(booksProvider);
    ref.invalidate(shelvesProvider);
  }

  Future<void> _write(Future<void> Function() action) async {
    setState(() => _actionError = null);
    try {
      await action();
      _refresh();
    } on ApiException catch (e) {
      if (mounted) setState(() => _actionError = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final book = ref.watch(bookProvider(widget.bookId));

    return book.when(
      loading: () => const LibraDeferred(child: _Skeleton()),
      error: (error, _) => Padding(
        padding: const EdgeInsets.all(LibraSpace.contentPaneHorizontal),
        child: LibraErrorBlock(
          message: error is NotFound
              ? 'That book is not in this library.'
              : error is ApiException
              ? error.message
              : 'Could not load this book.',
          // A 404 will 404 again; only offer a retry when one could help.
          onRetry: error is NotFound
              ? null
              : () => ref.invalidate(bookProvider(widget.bookId)),
        ),
      ),
      data: (b) => _Loaded(
        book: b,
        editing: _editing,
        actionError: _actionError,
        onEdit: () => setState(() => _editing = true),
        onCloseEdit: () {
          setState(() => _editing = false);
          _refresh();
        },
        write: _write,
        refresh: _refresh,
      ),
    );
  }
}

/// The frame: cover on the left, and either the details or the edit form on the
/// right. It deliberately reads nothing it does not use itself — the catalog
/// lists and the current user belong to [_Details], which is what consumes them.
class _Loaded extends StatelessWidget {
  const _Loaded({
    required this.book,
    required this.editing,
    required this.actionError,
    required this.onEdit,
    required this.onCloseEdit,
    required this.write,
    required this.refresh,
  });

  final Book book;
  final bool editing;
  final String? actionError;
  final VoidCallback onEdit;
  final VoidCallback onCloseEdit;
  final BookWrite write;
  final VoidCallback refresh;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(
        vertical: LibraSpace.contentPaneVertical,
        horizontal: LibraSpace.contentPaneHorizontal,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _BackToLibrary(),
          const SizedBox(height: 20),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              BookCover(book: book, width: 200),
              const SizedBox(width: 36),
              Expanded(
                child: editing
                    ? BookEditForm(book: book, onDone: onCloseEdit)
                    : _Details(
                        book: book,
                        actionError: actionError,
                        onEdit: onEdit,
                        write: write,
                        refresh: refresh,
                      ),
              ),
            ],
          ),
          const SizedBox(height: 40),
          NotesPanel(bookId: book.id),
        ],
      ),
    );
  }
}

/// Everything about the book that is not the cover or the edit form.
///
/// Reads the catalog lists and the current reader itself rather than being
/// handed them: it is the only thing on this screen that uses any of them, so
/// threading them through [_Loaded] made that widget depend on four things it
/// had no use for.
class _Details extends ConsumerWidget {
  const _Details({
    required this.book,
    required this.actionError,
    required this.onEdit,
    required this.write,
    required this.refresh,
  });

  final Book book;
  final String? actionError;
  final VoidCallback onEdit;
  final BookWrite write;
  final VoidCallback refresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(libraApiProvider);
    final user = ref.watch(currentUserProvider);
    final shelves = ref.watch(shelvesProvider).value ?? const <Shelf>[];
    final tags = ref.watch(tagsProvider).value ?? const <Tag>[];

    final shelf = shelves.where((s) => s.id == book.shelfId).firstOrNull;
    final bookTags = tags.where((t) => book.tagIds.contains(t.id)).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(book.title, style: LibraText.detailTitle),
        const SizedBox(height: 6),
        Text(book.author, style: LibraText.body.copyWith(fontSize: 15)),
        const SizedBox(height: 12),
        Text(_metadataLine, style: LibraText.metadata),
        const SizedBox(height: 18),
        RatingStars(
          rating: book.rating,
          // Immediate, because this is nobody else's business but the
          // reader's — there is nothing to confirm.
          // Progress goes along for the ride: the endpoint is a PUT for these
          // two, so sending only the rating would reset how far the reader had
          // got. The signature requires both for exactly that reason.
          onRate: (value) => write(
            () => api.setState(book.id, rating: value, progress: book.progress),
          ),
        ),
        if (bookTags.isNotEmpty) ...[
          const SizedBox(height: 18),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [for (final tag in bookTags) _TagPill(tag: tag)],
          ),
        ],
        if (book.blurb != null && book.blurb!.trim().isNotEmpty) ...[
          const SizedBox(height: 20),
          Text(book.blurb!, style: LibraText.body.copyWith(height: 1.6)),
        ],
        const SizedBox(height: 24),
        _ProgressPanel(book: book, shelf: shelf),
        const SizedBox(height: 24),
        BookActions(
          book: book,
          shelves: shelves,
          // PATCH /books/{id} is admin-only, so a reader is offered no Edit
          // Book rather than a form whose Save is guaranteed to 403.
          canEdit: user?.isAdmin ?? false,
          hasKindleAddress: user?.kindleEmail != null,
          onRead: () => context.go('/books/${book.id}/read'),
          onDownload: () async {
            final file = await api.downloadBook(book.id);
            saveFile(file.bytes, file.filename);
          },
          onSendToKindle: () async {
            // Deliberately not wrapped in `write`: the button owns this
            // failure and renders the reason itself, so the exception has to
            // reach it rather than being caught into the page-level error.
            await api.sendToKindle(book.id);
            // `last_sent_at` just moved, and the button reads it from the book.
            refresh();
          },
          onSetUpKindle: () => showKindleEmailModal(context),
          onEdit: onEdit,
          onMoveToShelf: (shelfId) => write(
            () => api.setState(
              book.id,
              rating: book.rating,
              progress: book.progress,
              shelfId: shelfId,
              clearShelf: shelfId == null,
            ),
          ),
        ),
        if (actionError != null) ...[
          const SizedBox(height: 16),
          LibraErrorBlock(message: actionError!),
        ],
      ],
    );
  }

  /// Only what the file actually declared. A book whose EPUB carries no year or
  /// page count shows neither, rather than an invented one.
  String get _metadataLine => [
    book.format.toUpperCase(),
    if (book.year != null) '${book.year}',
    if (book.pages != null) '${book.pages} pages',
  ].join('  ·  ');
}

class _TagPill extends StatelessWidget {
  const _TagPill({required this.tag});

  final Tag tag;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      // Tags are filters, here as in the sidebar: clicking one asks "what else
      // is like this?", which is the only thing a tag is for.
      onTap: () =>
          context.go(const LibraryFilter().toggleTag(tag.id).toLocation()),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            color: LibraColors.accentLight,
            borderRadius: BorderRadius.circular(LibraRadius.pill),
          ),
          child: Text(
            tag.name,
            style: LibraText.metadataSmall.copyWith(
              color: LibraColors.accent,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }
}

class _ProgressPanel extends StatelessWidget {
  const _ProgressPanel({required this.book, required this.shelf});

  final Book book;
  final Shelf? shelf;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: LibraColors.bg,
        borderRadius: BorderRadius.circular(LibraRadius.standard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('READING PROGRESS', style: LibraText.sectionLabel),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(2),
            child: LinearProgressIndicator(
              value: book.progress.clamp(0, 1),
              minHeight: 4,
              backgroundColor: LibraColors.border,
              valueColor: const AlwaysStoppedAnimation(LibraColors.accent),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            [
              '${(book.progress * 100).round()}% read',
              if (shelf != null) 'on ${shelf!.name}',
            ].join('  ·  '),
            style: LibraText.metadataSmall,
          ),
        ],
      ),
    );
  }
}

class _BackToLibrary extends StatelessWidget {
  const _BackToLibrary();

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: () => context.go(libraryRoute),
      icon: const Icon(Icons.arrow_back, size: 12),
      label: const Text('Library'),
    );
  }
}

class _Skeleton extends StatelessWidget {
  const _Skeleton();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: LibraSpace.contentPaneVertical,
        horizontal: LibraSpace.contentPaneHorizontal,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const LibraSkeletonBlock(width: 200, height: 290),
          const SizedBox(width: 36),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                LibraSkeletonLine(widthFactor: 0.6, height: 30),
                SizedBox(height: 12),
                LibraSkeletonLine(widthFactor: 0.35),
                SizedBox(height: 20),
                LibraSkeletonLine(widthFactor: 0.9, height: 12),
                SizedBox(height: 8),
                LibraSkeletonLine(widthFactor: 0.8, height: 12),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
