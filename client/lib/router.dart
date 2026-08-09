/// Real, linkable routes.
///
/// The design prototype switched on a `page` string, which meant no back
/// button, no deep link, and no way to send someone a book. `go_router` gives
/// all three, and the [ShellRoute] is what keeps the sidebar from rebuilding on
/// every navigation.
///
/// Route guards live here too, from #25: an unauthenticated request will
/// redirect to `/login?next=<attempted>` — which is the whole reason `/login`
/// is a route rather than a modal, and why it sits outside the shell.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/login_screen.dart';
import 'screens/pending_screen.dart';
import 'shell/app_shell.dart';
import 'widgets/empty_state.dart';
import 'widgets/page.dart';

GoRouter buildRouter({String initialLocation = '/'}) {
  return GoRouter(
    initialLocation: initialLocation,
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      ShellRoute(
        builder: (context, state, child) =>
            AppShell(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(
            path: '/',
            builder: (context, state) =>
                const PendingScreen(title: 'Library', issue: '#26'),
          ),
          GoRoute(
            path: '/shelves',
            builder: (context, state) =>
                const PendingScreen(title: 'Shelves', issue: '#28'),
          ),
          GoRoute(
            path: '/chat',
            builder: (context, state) =>
                const PendingScreen(title: 'Librarian', issue: '#32'),
          ),
          GoRoute(
            path: '/books/:id',
            builder: (context, state) =>
                const PendingScreen(title: 'Book', issue: '#27'),
          ),
        ],
      ),
    ],
    errorBuilder: (context, state) => const Scaffold(
      body: LibraPage(
        title: 'Not found',
        child: LibraEmptyState(
          title: 'No such page',
          message: 'The address does not match anything in this library.',
        ),
      ),
    ),
  );
}

/// A provider so #25 can rebuild the router when the session changes without
/// any widget knowing that happened.
final routerProvider = Provider<GoRouter>((ref) {
  final router = buildRouter();
  ref.onDispose(router.dispose);
  return router;
});
