/// The Kindle Email modal, reached from the account dropdown.
///
/// The helper line under the field is not decoration. Amazon silently discards
/// mail from a sender that is not on the reader's Approved Personal Document
/// E-mail list — no bounce, no error, the book simply never arrives — and that
/// was learned the hard way during Phase 1. `kindle_sender` comes down on
/// `/auth/me` precisely so this can show the real address to copy rather than a
/// placeholder.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/exceptions.dart';
import '../api/session_guard.dart';
import '../session/session.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/error_block.dart';

Future<void> showKindleEmailModal(BuildContext context) => showDialog<void>(
  context: context,
  builder: (_) => const KindleEmailModal(),
);

class KindleEmailModal extends ConsumerStatefulWidget {
  const KindleEmailModal({super.key});

  @override
  ConsumerState<KindleEmailModal> createState() => _KindleEmailModalState();
}

class _KindleEmailModalState extends ConsumerState<KindleEmailModal> {
  late final TextEditingController _controller = TextEditingController(
    text: ref.read(currentUserProvider)?.kindleEmail ?? '',
  );
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final user = ref.read(currentUserProvider);
    if (user == null || _saving) return;

    setState(() {
      _saving = true;
      _error = null;
    });

    final trimmed = _controller.text.trim();
    try {
      final updated = await ref
          .read(libraApiProvider)
          .updateUser(user.id, kindleEmail: trimmed.isEmpty ? null : trimmed);
      ref.read(sessionProvider.notifier).adopt(updated);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final sender = ref.watch(currentUserProvider)?.kindleSender;

    return AlertDialog(
      title: const Text('Kindle Email'),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Send-to-Kindle address', style: LibraText.fieldLabel),
            const SizedBox(height: 6),
            SizedBox(
              height: 42,
              child: TextField(
                controller: _controller,
                autofocus: true,
                keyboardType: TextInputType.emailAddress,
                style: LibraText.body,
                decoration: const InputDecoration(
                  hintText: 'you_a1b2c3@kindle.com',
                ),
                onSubmitted: (_) => _save(),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              sender == null
                  ? 'Add libra’s sender address to your Approved Personal '
                        'Document E-mail list, or Amazon will reject the delivery.'
                  : 'Add $sender to your Approved Personal Document E-mail '
                        'list, or Amazon will reject the delivery.',
              style: LibraText.metadataSmall.copyWith(height: 1.4),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              LibraErrorBlock(message: _error!),
            ],
          ],
        ),
      ),
      actionsPadding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
      actions: [
        OutlinedButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: LibraColors.card,
                  ),
                )
              : const Text('Save'),
        ),
      ],
    );
  }
}
