/// The sidebar: a scrollable middle over a pinned footer.
///
/// `client-design.md` replaces the handoff's single column (which pushed Add
/// Book down with `margin-top: auto`) with a three-part flex, because sign-out
/// must be reachable without hunting and a `margin-top: auto` button scrolls
/// away the moment the shelf list is long enough. The footer never scrolls.
///
/// The collapsible SHELVES / SHARED WITH YOU / TAGS sections belong to #28 and
/// #29 and are deliberately not stubbed here — this milestone owns the frame
/// and the primary nav, and an empty section with invented copy in it would be
/// harder to replace than nothing.
library;

import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import '../theme/typography.dart';
import 'account_row.dart';
import 'add_book_button.dart';
import 'nav_row.dart';

/// The primary nav. "Librarian" is the third row `client-design.md` adds, below
/// Shelves — the chat had no way in before it.
const sidebarDestinations = <NavDestination>[
  NavDestination(label: 'Library', icon: Icons.grid_view_outlined, route: '/'),
  NavDestination(
    label: 'Shelves',
    icon: Icons.collections_bookmark_outlined,
    route: '/shelves',
  ),
  NavDestination(
    label: 'Librarian',
    icon: Icons.chat_bubble_outline,
    route: '/chat',
  ),
];

class LibraSidebar extends StatelessWidget {
  const LibraSidebar({
    required this.location,
    required this.onNavigate,
    super.key,
  });

  /// The current route, so exactly one nav row is active.
  final String location;
  final ValueChanged<String> onNavigate;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: LibraSpace.sidebarWidth,
      decoration: const BoxDecoration(
        color: LibraColors.bg,
        border: Border(right: BorderSide(color: LibraColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                vertical: LibraSpace.sidebarVertical,
                horizontal: LibraSpace.sidebarHorizontal,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(left: 4, bottom: 24),
                    child: Text('libra', style: LibraText.logo),
                  ),
                  for (final d in sidebarDestinations)
                    NavRow(
                      destination: d,
                      selected: _isActive(d.route),
                      onTap: () => onNavigate(d.route),
                    ),
                ],
              ),
            ),
          ),
          _Footer(onAddBook: () {}),
        ],
      ),
    );
  }

  /// `/` would prefix-match every route, so it is matched exactly; the others
  /// stay prefix matches so a book detail page keeps Library lit.
  bool _isActive(String route) =>
      route == '/' ? location == '/' : location.startsWith(route);
}

class _Footer extends StatelessWidget {
  const _Footer({required this.onAddBook});

  final VoidCallback onAddBook;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(
        LibraSpace.sidebarHorizontal,
        12,
        LibraSpace.sidebarHorizontal,
        16,
      ),
      decoration: const BoxDecoration(
        border: Border(top: BorderSide(color: LibraColors.border)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AddBookButton(onPressed: onAddBook),
          const SizedBox(height: 8),
          const AccountRow(),
        ],
      ),
    );
  }
}
