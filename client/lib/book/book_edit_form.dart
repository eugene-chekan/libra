/// Edit mode: the shared catalog, behind Save and Cancel.
///
/// Deferred rather than immediate, unlike the rating and the shelf on the same
/// screen. Those are the reader's own; these are everyone's. A field that
/// rewrites the catalog for the whole household the instant it loses focus is
/// the wrong shape for a correction someone might be halfway through typing —
/// so nothing is written until Save, and Cancel discards the lot.
///
/// Reached only by an admin: `PATCH /books/{id}` is `require_admin`, because
/// title and author describe what everyone sees.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/exceptions.dart';
import '../api/models.dart';
import '../api/session_guard.dart';
import '../theme/typography.dart';
import '../widgets/error_block.dart';

class BookEditForm extends ConsumerStatefulWidget {
  const BookEditForm({required this.book, required this.onDone, super.key});

  final Book book;

  /// Called after a successful save and on cancel — both end edit mode, and
  /// the screen refetches either way rather than trusting its own copy.
  final VoidCallback onDone;

  @override
  ConsumerState<BookEditForm> createState() => _BookEditFormState();
}

class _BookEditFormState extends ConsumerState<BookEditForm> {
  late final _title = TextEditingController(text: widget.book.title);
  late final _author = TextEditingController(text: widget.book.author);
  late final _year = TextEditingController(
    text: widget.book.year?.toString() ?? '',
  );
  late final _pages = TextEditingController(
    text: widget.book.pages?.toString() ?? '',
  );
  late final _blurb = TextEditingController(text: widget.book.blurb ?? '');

  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_title, _author, _year, _pages, _blurb]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });

    try {
      await ref
          .read(libraApiProvider)
          .updateBook(
            widget.book.id,
            title: _title.text.trim(),
            author: _author.text.trim(),
            // Blank clears nothing: an empty box means "I have no value for
            // this", and the server treats an absent key as unchanged. Wiping
            // a year because someone tabbed through would be a surprise.
            year: int.tryParse(_year.text.trim()),
            pages: int.tryParse(_pages.text.trim()),
            blurb: _blurb.text.trim(),
          );
      widget.onDone();
    } on Forbidden {
      // Reachable if an admin is demoted while the form is open. The server is
      // the authority; the hidden button was only ever a courtesy.
      if (mounted) {
        setState(() => _error = 'Only an admin can edit the catalog.');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('EDITING', style: LibraText.sectionLabel),
        const SizedBox(height: 16),
        _Field(label: 'Title', controller: _title),
        const SizedBox(height: 14),
        _Field(label: 'Author', controller: _author),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: _Field(
                label: 'Year',
                controller: _year,
                keyboardType: TextInputType.number,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: _Field(
                label: 'Pages',
                controller: _pages,
                keyboardType: TextInputType.number,
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        _Field(label: 'Blurb', controller: _blurb, maxLines: 5),
        if (_error != null) ...[
          const SizedBox(height: 16),
          LibraErrorBlock(message: _error!),
        ],
        const SizedBox(height: 20),
        Row(
          children: [
            OutlinedButton(
              onPressed: _saving ? null : widget.onDone,
              child: const Text('Cancel'),
            ),
            const SizedBox(width: 10),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: const Text('Save'),
            ),
          ],
        ),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.controller,
    this.maxLines = 1,
    this.keyboardType,
  });

  final String label;
  final TextEditingController controller;
  final int maxLines;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: LibraText.fieldLabel),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          maxLines: maxLines,
          keyboardType: keyboardType,
          style: LibraText.body,
        ),
      ],
    );
  }
}
