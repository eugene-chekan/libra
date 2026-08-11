/// The book detail action row — two rows, split on meaning.
///
/// The design drew three buttons; there are five. They do not fit one row at
/// 1024px, so rather than letting them wrap into whatever shape the viewport
/// dictates, they split where the meaning already divides: **what you do with
/// the book**, then **how you file it**. That reads as a decision rather than a
/// reflow, and it is what makes the screen survive its minimum width.
///
/// The three-state primary label was very nearly attached to Download. It would
/// have been a small lie — a reader clicking "Start Reading" and finding a file
/// in their downloads folder — and it is the reason the reader exists at all.
/// Now the label is true and Download says exactly what it does.
library;

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme/tokens.dart';
import '../widgets/upward_dropdown.dart';
import 'kindle_button.dart';

class BookActions extends StatelessWidget {
  const BookActions({
    required this.book,
    required this.shelves,
    required this.canEdit,
    required this.hasKindleAddress,
    required this.onRead,
    required this.onDownload,
    required this.onSendToKindle,
    required this.onSetUpKindle,
    required this.onEdit,
    required this.onMoveToShelf,
    super.key,
  });

  final Book book;
  final List<Shelf> shelves;

  /// Whether this reader may edit the shared catalog. `PATCH /books/{id}` is
  /// admin-only, so a reader without it is shown no Edit Book button rather
  /// than a form whose Save is guaranteed to fail.
  final bool canEdit;

  final bool hasKindleAddress;
  final VoidCallback onRead;
  final Future<void> Function() onDownload;
  final Future<void> Function() onSendToKindle;
  final VoidCallback onSetUpKindle;
  final VoidCallback onEdit;

  /// Null takes the book off its shelf.
  final ValueChanged<int?> onMoveToShelf;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Row 1 — what you do with the book.
        Wrap(
          spacing: 10,
          runSpacing: 10,
          crossAxisAlignment: WrapCrossAlignment.start,
          children: [
            FilledButton(onPressed: onRead, child: Text(_primaryLabel)),
            _DownloadButton(onDownload: onDownload),
            KindleButton(
              hasAddress: hasKindleAddress,
              lastSentAt: book.lastSentAt,
              onSend: onSendToKindle,
              onSetUpAddress: onSetUpKindle,
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Row 2 — how you file it.
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            if (canEdit)
              OutlinedButton(
                onPressed: onEdit,
                style: _secondary,
                child: const Text('Edit Book'),
              ),
            _MoveToShelfButton(
              shelves: shelves,
              currentShelfId: book.shelfId,
              onSelected: onMoveToShelf,
            ),
          ],
        ),
      ],
    );
  }

  /// The handoff's three states, kept: what the button offers depends on where
  /// the reader already is.
  String get _primaryLabel {
    if (book.progress <= 0) return 'Start Reading';
    if (book.progress >= 1) return 'Read Again';
    return 'Continue Reading';
  }
}

/// Row 2's smaller treatment: 9px/18px, 13px labels.
final ButtonStyle _secondary = OutlinedButton.styleFrom(
  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
  textStyle: const TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 13,
    fontWeight: FontWeight.w600,
  ),
);

class _DownloadButton extends StatefulWidget {
  const _DownloadButton({required this.onDownload});

  final Future<void> Function() onDownload;

  @override
  State<_DownloadButton> createState() => _DownloadButtonState();
}

class _DownloadButtonState extends State<_DownloadButton> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: _busy
          ? null
          : () async {
              setState(() => _busy = true);
              try {
                await widget.onDownload();
              } finally {
                if (mounted) setState(() => _busy = false);
              }
            },
      // A spinner inside the control that started it — the app's rule for
      // actions the reader took, as against skeletons for content arriving.
      icon: _busy
          ? const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: LibraColors.textLight,
              ),
            )
          : const Icon(Icons.download_outlined, size: 14),
      label: const Text('Download'),
    );
  }
}

class _MoveToShelfButton extends StatelessWidget {
  const _MoveToShelfButton({
    required this.shelves,
    required this.currentShelfId,
    required this.onSelected,
  });

  final List<Shelf> shelves;
  final int? currentShelfId;
  final ValueChanged<int?> onSelected;

  @override
  Widget build(BuildContext context) {
    return UpwardDropdown(
      trigger: (context, open, node) => OutlinedButton.icon(
        focusNode: node,
        onPressed: open,
        style: _secondary,
        iconAlignment: IconAlignment.end,
        icon: const Icon(Icons.keyboard_arrow_up, size: 10),
        label: const Text('Move to Shelf'),
      ),
      menuBuilder: (context, close) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final shelf in shelves)
            DropdownRow(
              label: shelf.name,
              icon: shelf.id == currentShelfId ? Icons.check : null,
              onTap: () {
                close();
                onSelected(shelf.id);
              },
            ),
          // Only when there is something to remove it from. Offering it
          // otherwise would be a control that cannot do anything.
          if (currentShelfId != null) ...[
            const DropdownDivider(),
            DropdownRow(
              label: 'Remove from shelf',
              icon: Icons.close,
              muted: true,
              onTap: () {
                close();
                onSelected(null);
              },
            ),
          ],
        ],
      ),
    );
  }
}
