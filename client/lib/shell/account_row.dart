/// The account row at the foot of the sidebar, and the menu it opens.
///
/// This is the furniture gaps 1 and 2 both hang off: before it there was
/// nowhere to sign out, and nowhere to reach user administration from.
///
/// While `GET /auth/me` is still out the row shows a skeleton in place of the
/// username — not a placeholder for the scaffold's sake but the state it is
/// genuinely in on every cold load.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models.dart';
import '../session/session.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import '../widgets/skeleton.dart';
import '../widgets/tappable_row.dart';
import '../widgets/upward_dropdown.dart';
import 'kindle_email_modal.dart';

class AccountRow extends ConsumerWidget {
  const AccountRow({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return UpwardDropdown(
      trigger: (context, open, node) => Focus(
        focusNode: node,
        child: LibraTappableRow(
          // Inert until the session resolves: there is nothing to sign out of,
          // and no way to know whether Manage Users belongs in the menu.
          onTap: user == null ? () {} : open,
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
        ),
      ),
      menuBuilder: (context, close) => _AccountMenu(close: close),
    );
  }
}

class _AccountMenu extends ConsumerWidget {
  const _AccountMenu({required this.close});

  final VoidCallback close;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        DropdownRow(
          label: 'Kindle Email…',
          onTap: () {
            close();
            showKindleEmailModal(context);
          },
        ),
        // Rendered only for an admin. The modal itself is #31; the entry point
        // is here because the menu is what makes it reachable at all.
        if (user?.isAdmin ?? false)
          DropdownRow(label: 'Manage Users', onTap: close),
        const DropdownDivider(),
        DropdownRow(
          label: 'Sign Out',
          icon: Icons.logout,
          muted: true,
          onTap: () {
            close();
            // Clears state and revokes server-side; the router's redirect
            // notices the anonymous session and moves to /login.
            ref.read(sessionProvider.notifier).signOut();
          },
        ),
      ],
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

  final CurrentUser user;

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
