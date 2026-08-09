/// A primary nav row in the sidebar.
///
/// Icons are Material's `_outlined` cuts. The design asks for Feather/Lucide —
/// `fill="none"`, `stroke="currentColor"`, round caps — and the outlined set is
/// the closest thing already in the bundle; pulling in an icon package to close
/// a small visual gap is a decision for a screen that needs it, not for the
/// scaffold.
library;

import 'package:flutter/material.dart';

import '../theme/typography.dart';
import '../widgets/tappable_row.dart';

class NavDestination {
  const NavDestination({
    required this.label,
    required this.icon,
    required this.route,
  });

  final String label;
  final IconData icon;
  final String route;
}

class NavRow extends StatelessWidget {
  const NavRow({
    required this.destination,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final NavDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final style = selected ? LibraText.navRowActive : LibraText.navRow;

    return LibraTappableRow(
      onTap: onTap,
      selected: selected,
      child: Row(
        children: [
          Icon(destination.icon, size: 16, color: style.color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              destination.label,
              style: style,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
