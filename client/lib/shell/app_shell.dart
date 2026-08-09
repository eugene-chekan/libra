/// The frame every signed-in route renders inside: sidebar left, content pane
/// right.
///
/// A [ShellRoute] rather than something each screen wraps itself in, so the
/// sidebar is built once and survives navigation — which is what keeps the
/// active nav row correct and, later, holds the shelf list's scroll position
/// while the reader opens a book and comes back.
///
/// `/login` sits outside this shell: it has no sidebar, and there is nothing to
/// sign out of yet.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../theme/tokens.dart';
import 'sidebar.dart';

class AppShell extends ConsumerWidget {
  const AppShell({required this.location, required this.child, super.key});

  /// The full location *including* the query string, not just the matched path:
  /// the sidebar's shelf and tag rows have to show which of them the current
  /// filter selected, and that lives in the query.
  ///
  /// Passed down rather than read off the context so the sidebar stays a pure
  /// function of a string, and testable without a router.
  final String location;

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // No cold-load branch here on purpose: the router keeps this route from
    // matching at all until the session is known (see `startingRoute`). Hiding
    // go_router's `child` instead would unmount the shell navigator's
    // GlobalKey and re-attach it a frame later, which Flutter reports as a
    // duplicate key.
    return Scaffold(
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          LibraSidebar(
            location: location,
            onNavigate: (route) {
              if (route != location) context.go(route);
            },
          ),
          Expanded(
            child: ColoredBox(color: LibraColors.card, child: child),
          ),
        ],
      ),
    );
  }
}
