/// Send to Kindle, and its five states.
///
/// The only long-running action in the app, and the one most likely to fail for
/// reasons outside it — an address never set, an Amazon approval never granted,
/// an SMTP server that will not talk today. Each of those wants a different
/// sentence, so the button has five states rather than a spinner and a shrug.
///
/// The failure reason comes from the API verbatim. That is safe by
/// construction: the backend raises `SendFailedError` with a message written to
/// be shown, and keeps the SMTP server's own response — which quotes the
/// username — in the log instead.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../api/exceptions.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';

enum KindleState { idle, sending, sent, failed }

class KindleButton extends StatefulWidget {
  const KindleButton({
    required this.hasAddress,
    required this.onSend,
    required this.onSetUpAddress,
    this.lastSentAt,
    super.key,
  });

  /// False when the reader has no `kindle_email`. Distinct from a plain
  /// disabled button: there is something they can do about it, and the line
  /// below the row says what.
  final bool hasAddress;

  final Future<void> Function() onSend;

  /// Opens the Kindle Email modal, which is where the address is set.
  final VoidCallback onSetUpAddress;

  /// Answers "did I already send this?", which is the question a reader
  /// actually has. Shown only when nothing else is.
  final DateTime? lastSentAt;

  @override
  State<KindleButton> createState() => _KindleButtonState();
}

class _KindleButtonState extends State<KindleButton> {
  KindleState _state = KindleState.idle;
  String? _failure;
  Timer? _settle;

  @override
  void dispose() {
    _settle?.cancel();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _state = KindleState.sending;
      _failure = null;
    });

    try {
      await widget.onSend();
      if (!mounted) return;
      setState(() => _state = KindleState.sent);
      // Back to idle on its own: "Sent" is a confirmation, not a new resting
      // state, and leaving it there would make the next send look done already.
      _settle = Timer(LibraDurations.transientConfirmation, () {
        if (mounted) setState(() => _state = KindleState.idle);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      // Returns to idle rather than staying failed: the button is usable
      // again, and the reason sits below the row where it can be read.
      setState(() {
        _state = KindleState.failed;
        _failure = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [_button(), ..._note()],
    );
  }

  Widget _button() {
    if (!widget.hasAddress) {
      return OutlinedButton.icon(
        onPressed: null,
        icon: const Icon(Icons.send_outlined, size: 14),
        label: const Text('Send to Kindle'),
      );
    }

    return switch (_state) {
      KindleState.sending => OutlinedButton.icon(
        onPressed: null,
        icon: const SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: LibraColors.textLight,
          ),
        ),
        label: const Text('Sending…'),
      ),
      KindleState.sent => OutlinedButton.icon(
        onPressed: null,
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: LibraColors.accent, width: 1.5),
          foregroundColor: LibraColors.accent,
          disabledForegroundColor: LibraColors.accent,
        ),
        icon: const Icon(Icons.check, size: 14, color: LibraColors.accent),
        label: const Text('Sent'),
      ),
      _ => OutlinedButton.icon(
        onPressed: _send,
        icon: const Icon(Icons.send_outlined, size: 14),
        label: const Text('Send to Kindle'),
      ),
    };
  }

  List<Widget> _note() {
    if (!widget.hasAddress) {
      return [
        const SizedBox(height: 8),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Add a Kindle address in ', style: LibraText.metadataSmall),
            // The words "your account" are the link, as drawn — the fix is one
            // click away, so the copy should take them there rather than
            // describe where to go.
            InkWell(
              onTap: widget.onSetUpAddress,
              child: Text(
                'your account',
                style: LibraText.metadataSmall.copyWith(
                  color: LibraColors.accent,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
            Text(' first.', style: LibraText.metadataSmall),
          ],
        ),
      ];
    }

    if (_state == KindleState.failed && _failure != null) {
      return [
        const SizedBox(height: 8),
        Text(
          "Couldn't send — $_failure",
          style: LibraText.metadataSmall.copyWith(color: LibraColors.danger),
        ),
      ];
    }

    if (_state == KindleState.idle && widget.lastSentAt != null) {
      return [
        const SizedBox(height: 8),
        Text(
          'Last sent ${relativeTime(widget.lastSentAt!)}',
          style: LibraText.metadataSmall,
        ),
      ];
    }

    return const [];
  }
}

/// "3 days ago", in the coarsest unit that is still true.
///
/// Precision past a day is noise for a question like "did I already send
/// this?" — the useful distinction is today, this week, or a while ago.
String relativeTime(DateTime when, {DateTime? now}) {
  final delta = (now ?? DateTime.now()).difference(when);

  if (delta.inSeconds < 60) return 'just now';
  if (delta.inMinutes < 60) {
    return '${delta.inMinutes} minute${delta.inMinutes == 1 ? '' : 's'} ago';
  }
  if (delta.inHours < 24) {
    return '${delta.inHours} hour${delta.inHours == 1 ? '' : 's'} ago';
  }
  if (delta.inDays < 30) {
    return '${delta.inDays} day${delta.inDays == 1 ? '' : 's'} ago';
  }
  final months = delta.inDays ~/ 30;
  if (months < 12) return '$months month${months == 1 ? '' : 's'} ago';
  final years = delta.inDays ~/ 365;
  return '$years year${years == 1 ? '' : 's'} ago';
}
