/// The account row at the foot of the sidebar.
///
/// This is the furniture gaps 1 and 2 both hang off: before it there was
/// nowhere to sign out, and nowhere to reach user administration from.
///
/// The row is built here; the dropdown it opens is #25, along with the session
/// that fills it. Until then [sessionProvider] resolves to `null` and the row
/// shows a skeleton in place of the username — which is not a placeholder for
/// the sake of the scaffold but the state this row will genuinely be in on
/// every cold load, before `GET /auth/me` answers.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../session/session.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/skeleton.dart';
import '../widgets/tappable_row.dart';

class AccountRow extends ConsumerWidget {
  const AccountRow({this.onTap, super.key});

  /// Opens the account dropdown. Wired in #25; until then the row is inert
  /// rather than absent, because the sidebar's shape is what this milestone is
  /// for.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(sessionProvider);

    return LibraTappableRow(
      onTap: onTap ?? () {},
      semanticLabel: user == null ? 'Account' : 'Account: ${user.username}',
      child: Row(
        children: [
          _Avatar(initial: user?.initial),
          const SizedBox(width: 10),
          Expanded(
            child: user == null
                ? const LibraSkeletonLine(widthFactor: 0.7, height: 12)
                : _Identity(user: user),
          ),
          const Icon(
            Icons.keyboard_arrow_up,
            size: 14,
            color: LibraColors.textLight,
          ),
        ],
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({this.initial});

  final String? initial;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: LibraColors.accentLight,
        shape: BoxShape.circle,
      ),
      child: Text(
        initial ?? '',
        style: const TextStyle(
          fontFamily: LibraFonts.sans,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: LibraColors.accent,
        ),
      ),
    );
  }
}

/// Username, and "Admin" beneath it only when the reader is one — so the row
/// stays single-line for everybody else.
class _Identity extends StatelessWidget {
  const _Identity({required this.user});

  final SessionUser user;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          user.username,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontFamily: LibraFonts.sans,
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: LibraColors.text,
          ),
        ),
        if (user.isAdmin) Text('Admin', style: LibraText.metadataSmall),
      ],
    );
  }
}
