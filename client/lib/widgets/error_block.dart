/// The one error shape, used everywhere.
///
/// Placed where the content would have been, never as a toast. A toast that
/// vanishes is unhelpful for something the reader may need to act on, and this
/// application has no notification region to put one in.
///
/// The shape — inset fill, 3px accent bar down the left — is the note quote
/// card from the book detail screen, recoloured. One idiom, learned once.
library;

import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import '../theme/typography.dart';

class LibraErrorBlock extends StatelessWidget {
  const LibraErrorBlock({
    required this.message,
    this.onRetry,
    this.retryLabel,
    super.key,
  });

  final String message;

  /// Omitted when a retry would be meaningless — a `404`, or a validation
  /// failure the reader has to change something to fix.
  final VoidCallback? onRetry;
  final String? retryLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: const BoxDecoration(
        color: LibraColors.bg,
        borderRadius: BorderRadius.all(Radius.circular(LibraRadius.standard)),
        border: Border(left: BorderSide(color: LibraColors.danger, width: 3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message, style: LibraText.body.copyWith(height: 1.5)),
          if (onRetry != null) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(
                Icons.refresh,
                size: 12,
                color: LibraColors.accent,
              ),
              label: Text(retryLabel ?? 'Try again'),
            ),
          ],
        ],
      ),
    );
  }
}
