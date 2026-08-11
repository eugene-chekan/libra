/// Notes and highlights, against the real endpoints.
///
/// Every note here belongs to the reader looking at it — the API returns no
/// others and accepts no others — so there is no author line and no sharing
/// affordance. The panel is deliberately plain: a note is a thing you wrote to
/// yourself, and decorating it would be the wrong emphasis.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/exceptions.dart';
import '../api/models.dart';
import '../api/session_guard.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/error_block.dart';
import 'providers.dart';

class NotesPanel extends ConsumerStatefulWidget {
  const NotesPanel({required this.bookId, super.key});

  final int bookId;

  @override
  ConsumerState<NotesPanel> createState() => _NotesPanelState();
}

class _NotesPanelState extends ConsumerState<NotesPanel> {
  final _draft = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _draft.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final text = _draft.text.trim();
    if (text.isEmpty || _saving) return;

    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(libraApiProvider).createNote(widget.bookId, text: text);
      _draft.clear();
      ref.invalidate(notesProvider(widget.bookId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete(Note note) async {
    try {
      await ref.read(libraApiProvider).deleteNote(note.id);
      ref.invalidate(notesProvider(widget.bookId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final notes = ref.watch(notesProvider(widget.bookId));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('NOTES & HIGHLIGHTS', style: LibraText.sectionLabel),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _draft,
                minLines: 2,
                maxLines: 5,
                style: LibraText.body,
                decoration: const InputDecoration(hintText: 'Add a note…'),
                onSubmitted: (_) => _add(),
              ),
            ),
            const SizedBox(width: 10),
            FilledButton(
              onPressed: _saving ? null : _add,
              child: const Text('Add'),
            ),
          ],
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          LibraErrorBlock(message: _error!),
        ],
        const SizedBox(height: 16),
        notes.when(
          loading: () => const SizedBox.shrink(),
          error: (e, _) => LibraErrorBlock(
            message: e is ApiException ? e.message : 'Could not load notes.',
            onRetry: () => ref.invalidate(notesProvider(widget.bookId)),
          ),
          data: (items) => items.isEmpty
              ? Text('No notes yet.', style: LibraText.metadata)
              : Column(
                  children: [
                    for (final note in items)
                      _NoteCard(note: note, onDelete: () => _delete(note)),
                  ],
                ),
        ),
      ],
    );
  }
}

/// The quote-card idiom: inset fill with a 3px accent bar down the left. The
/// error block is the same shape recoloured — one idiom, learned once.
class _NoteCard extends StatelessWidget {
  const _NoteCard({required this.note, required this.onDelete});

  final Note note;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: const BoxDecoration(
        color: LibraColors.bg,
        borderRadius: BorderRadius.all(Radius.circular(LibraRadius.standard)),
        border: Border(left: BorderSide(color: LibraColors.accent, width: 3)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(note.text, style: LibraText.body.copyWith(height: 1.5)),
                if (note.page != null) ...[
                  const SizedBox(height: 6),
                  Text('p. ${note.page}', style: LibraText.metadataSmall),
                ],
              ],
            ),
          ),
          IconButton(
            onPressed: onDelete,
            icon: const Icon(Icons.delete_outline, size: 14),
            color: LibraColors.textLight,
            hoverColor: LibraColors.danger.withValues(alpha: 0.1),
            tooltip: 'Delete note',
          ),
        ],
      ),
    );
  }
}
