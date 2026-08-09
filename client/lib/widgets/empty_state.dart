/// The one empty shape.
///
/// Settled in `docs/specs/client-design.md` alongside loading and error,
/// because the handoff listed the empty first-run library as undesigned and
/// asked not to have it invented per screen.
///
/// The first-run library is the case that shaped the API: it wants a title, a
/// line of guidance, and one action — and that action is a *solid* accent
/// button, unlike the sidebar's dashed Add Book, because on an empty library it
/// is the only thing to do on the screen. That is why [action] is a `Widget`
/// rather than a label and a callback: the caller owns which button this is.
library;

import 'package:flutter/material.dart';

import '../theme/typography.dart';

class LibraEmptyState extends StatelessWidget {
  const LibraEmptyState({
    required this.title,
    this.message,
    this.action,
    super.key,
  });

  final String title;

  /// The line under the title. Omitted when the title says everything — the
  /// search empty state is one line and stays that way.
  final String? message;

  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 60),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              title,
              style: LibraText.modalHeading,
              textAlign: TextAlign.center,
            ),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                style: LibraText.metadata,
                textAlign: TextAlign.center,
              ),
            ],
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}
