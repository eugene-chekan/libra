/// Manage Shelves: create, rename, reorder, publish, delete.
///
/// **Reordering is a real drag**, which the handoff advertised and never
/// implemented (its bug 8). The chevrons stay alongside it rather than being
/// replaced: a drag is unusable from a keyboard, and reordering is not an
/// optional flourish.
///
/// Order commits through `PUT /shelves/order`, which takes the complete list in
/// one call — so a reorder is one atomic decision rather than a race between
/// rows settling in whatever sequence they happen to arrive.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/exceptions.dart';
import '../api/models.dart';
import '../api/session_guard.dart';
import '../library/providers.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/error_block.dart';
import 'shelves_screen.dart' show PublicPill;

Future<void> showShelfManager(BuildContext context) =>
    showDialog<void>(context: context, builder: (_) => const ShelfManager());

class ShelfManager extends ConsumerStatefulWidget {
  const ShelfManager({super.key});

  @override
  ConsumerState<ShelfManager> createState() => _ShelfManagerState();
}

class _ShelfManagerState extends ConsumerState<ShelfManager> {
  final _newName = TextEditingController();
  int? _editingId;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _newName.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      ref.invalidate(shelvesProvider);
      ref.invalidate(booksProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Only the reader's own shelves are orderable or editable; other people's
  /// public ones are not shown here at all, because there is nothing on this
  /// screen they could be used for.
  List<Shelf> get _mine => (ref.watch(shelvesProvider).value ?? const <Shelf>[])
      .where((s) => s.editable)
      .toList();

  @override
  Widget build(BuildContext context) {
    final mine = _mine;

    return AlertDialog(
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Manage Shelves'),
          const SizedBox(height: 4),
          Text(
            '${mine.length} ${mine.length == 1 ? 'shelf' : 'shelves'}',
            style: LibraText.metadataSmall,
          ),
        ],
      ),
      content: SizedBox(
        width: 460,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 420),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Flexible(
                child: mine.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(
                          'No shelves yet.',
                          style: LibraText.metadata,
                        ),
                      )
                    : ReorderableListView.builder(
                        shrinkWrap: true,
                        buildDefaultDragHandles: false,
                        itemCount: mine.length,
                        // `onReorderItem` rather than `onReorder`: it reports
                        // the index the item actually lands on, instead of one
                        // in the pre-removal list that every caller has to
                        // adjust by hand.
                        onReorderItem: (from, to) {
                          final ids = [for (final s in mine) s.id];
                          ids.insert(to, ids.removeAt(from));
                          _run(
                            () =>
                                ref.read(libraApiProvider).reorderShelves(ids),
                          );
                        },
                        itemBuilder: (context, i) => _ShelfRow(
                          key: ValueKey(mine[i].id),
                          shelf: mine[i],
                          index: i,
                          isFirst: i == 0,
                          isLast: i == mine.length - 1,
                          editing: _editingId == mine[i].id,
                          busy: _busy,
                          onEdit: () => setState(() => _editingId = mine[i].id),
                          onDoneEditing: () =>
                              setState(() => _editingId = null),
                          onMove: (delta) {
                            final ids = [for (final s in mine) s.id];
                            final target = i + delta;
                            if (target < 0 || target >= ids.length) return;
                            ids.insert(target, ids.removeAt(i));
                            _run(
                              () => ref
                                  .read(libraApiProvider)
                                  .reorderShelves(ids),
                            );
                          },
                          onSave: (name, isPublic) => _run(() async {
                            await ref
                                .read(libraApiProvider)
                                .updateShelf(
                                  mine[i].id,
                                  name: name,
                                  isPublic: isPublic,
                                );
                            if (mounted) setState(() => _editingId = null);
                          }),
                          onDelete: () => _confirmDelete(mine[i]),
                        ),
                      ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _newName,
                      style: LibraText.body,
                      decoration: const InputDecoration(
                        hintText: 'New shelf name',
                      ),
                      onSubmitted: (_) => _create(),
                    ),
                  ),
                  const SizedBox(width: 10),
                  FilledButton(
                    onPressed: _busy ? null : _create,
                    child: const Text('Add'),
                  ),
                ],
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                LibraErrorBlock(message: _error!),
              ],
            ],
          ),
        ),
      ),
      actions: [
        FilledButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Close'),
        ),
      ],
    );
  }

  Future<void> _create() async {
    final name = _newName.text.trim();
    if (name.isEmpty || _busy) return;
    await _run(() async {
      await ref.read(libraApiProvider).createShelf(name: name);
      _newName.clear();
    });
  }

  Future<void> _confirmDelete(Shelf shelf) async {
    // A real dialog, never the native `confirm()` the prototype used: this is
    // destructive, and the copy has to say exactly what survives it.
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete ${shelf.name}?'),
        content: SizedBox(
          width: 420,
          child: Text(
            'The shelf goes; the books on it stay in your library. '
            'This cannot be undone.',
            style: LibraText.body.copyWith(height: 1.5),
          ),
        ),
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: LibraColors.danger,
              foregroundColor: LibraColors.card,
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed ?? false) {
      await _run(() => ref.read(libraApiProvider).deleteShelf(shelf.id));
    }
  }
}

class _ShelfRow extends StatefulWidget {
  const _ShelfRow({
    required this.shelf,
    required this.index,
    required this.isFirst,
    required this.isLast,
    required this.editing,
    required this.busy,
    required this.onEdit,
    required this.onDoneEditing,
    required this.onMove,
    required this.onSave,
    required this.onDelete,
    super.key,
  });

  final Shelf shelf;
  final int index;
  final bool isFirst;
  final bool isLast;
  final bool editing;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback onDoneEditing;
  final ValueChanged<int> onMove;
  final void Function(String name, bool isPublic) onSave;
  final VoidCallback onDelete;

  @override
  State<_ShelfRow> createState() => _ShelfRowState();
}

class _ShelfRowState extends State<_ShelfRow> {
  late final _name = TextEditingController(text: widget.shelf.name);
  late bool _isPublic = widget.shelf.isPublic;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.editing) return _editor();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          // The drag handle, and the keyboard path beside it. A drag alone
          // would make reordering mouse-only.
          ReorderableDragStartListener(
            index: widget.index,
            child: const MouseRegion(
              cursor: SystemMouseCursors.grab,
              child: Icon(
                Icons.drag_indicator,
                size: 16,
                color: LibraColors.textLight,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    widget.shelf.name,
                    style: LibraText.listRow.copyWith(color: LibraColors.text),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (widget.shelf.isPublic) ...[
                  const SizedBox(width: 8),
                  const PublicPill(),
                ],
              ],
            ),
          ),
          Text('${widget.shelf.bookCount}', style: LibraText.metadataSmall),
          const SizedBox(width: 4),
          _IconAction(
            icon: Icons.keyboard_arrow_up,
            tooltip: 'Move up',
            onPressed: widget.isFirst || widget.busy
                ? null
                : () => widget.onMove(-1),
          ),
          _IconAction(
            icon: Icons.keyboard_arrow_down,
            tooltip: 'Move down',
            onPressed: widget.isLast || widget.busy
                ? null
                : () => widget.onMove(1),
          ),
          _IconAction(
            icon: Icons.edit_outlined,
            tooltip: 'Rename',
            onPressed: widget.busy ? null : widget.onEdit,
          ),
          _IconAction(
            icon: Icons.delete_outline,
            tooltip: 'Delete',
            danger: true,
            onPressed: widget.busy ? null : widget.onDelete,
          ),
        ],
      ),
    );
  }

  Widget _editor() {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 6),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: LibraColors.bg,
        borderRadius: BorderRadius.circular(LibraRadius.standard),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(controller: _name, style: LibraText.body),
          const SizedBox(height: 10),
          Row(
            children: [
              Checkbox(
                value: _isPublic,
                onChanged: (v) => setState(() => _isPublic = v ?? false),
              ),
              Text('Visible to other readers', style: LibraText.body),
            ],
          ),
          // Publishing is the only action in the app that exposes something to
          // another person, so it gets a sentence rather than a bare toggle.
          if (_isPublic)
            Padding(
              padding: const EdgeInsets.only(left: 12, top: 6),
              child: Text(
                'Anyone with an account can see this shelf and the books on '
                'it. Only you can change it.',
                style: LibraText.metadataSmall.copyWith(height: 1.4),
              ),
            ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              OutlinedButton(
                onPressed: widget.onDoneEditing,
                child: const Text('Cancel'),
              ),
              const SizedBox(width: 10),
              FilledButton(
                onPressed: () => widget.onSave(_name.text.trim(), _isPublic),
                child: const Text('Save'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _IconAction extends StatelessWidget {
  const _IconAction({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.danger = false,
  });

  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon, size: 14),
      color: LibraColors.textLight,
      hoverColor: (danger ? LibraColors.danger : LibraColors.accent).withValues(
        alpha: 0.1,
      ),
      tooltip: tooltip,
      constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
      padding: EdgeInsets.zero,
    );
  }
}
