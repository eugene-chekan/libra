/// Real, linkable routes, and the guard that keeps them private.
///
/// The design prototype switched on a `page` string, which meant no back
/// button, no deep link, and no way to send someone a book. `go_router` gives
/// all three, and the [ShellRoute] is what keeps the sidebar from rebuilding on
/// every navigation.
///
/// **Three session states, three behaviours.** The cold-load window — before
/// `GET /auth/me` answers — is its own route, [startingRoute], rather than a
/// flag the shell reads. Letting a protected route match while the session is
/// unknown means mounting the shell for someone who may not be allowed it, then
/// tearing it down a frame later; that churns the shell navigator's
/// `GlobalKey`, and from milestone 4 onwards it would also fire every screen's
/// initial load before anyone knows whether there is a session to load it with.
/// Redirecting to `/login` instead would be worse: every signed-in reader would
/// see the login card flash on every refresh.
///
/// The destination rides along as `?next=` through the whole journey, so a deep
/// link survives both the wait and the sign-in.
///
/// The redirect is also where session expiry becomes visible. It derives `next`
/// from the location it is redirecting *away from*, so the value is the route
/// the reader actually lost — not whichever of several in-flight requests
/// happened to fail first. Combined with [SessionController.expire] being
/// idempotent, that is what makes a burst of 401s produce exactly one redirect.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'screens/login_screen.dart';
import 'screens/pending_screen.dart';
import 'session/session.dart';
import 'shell/app_shell.dart';
import 'theme/tokens.dart';
import 'widgets/empty_state.dart';
import 'widgets/page.dart';

const loginRoute = '/login';

/// Where the app waits for `GET /auth/me`. Blank rather than a spinner: on
/// localhost it is gone within a frame or two, and a spinner that flashes is
/// worse than nothing.
const startingRoute = '/starting';

/// The query parameter carrying where to return to. Named once so the login
/// screen and the redirect cannot disagree about it.
const nextParam = 'next';

/// `path`, carrying `target` as `next` — unless `target` is nothing or `/`,
/// which is where these routes send people anyway.
String _withNext(String path, String? target) =>
    (target == null || target.isEmpty || target == '/')
    ? path
    : Uri(path: path, queryParameters: {nextParam: target}).toString();

GoRouter buildRouter(Ref ref, {String initialLocation = '/'}) {
  return GoRouter(
    initialLocation: initialLocation,
    // Re-runs the redirect whenever the session changes, which is how an expiry
    // that happens with no navigation still moves the reader.
    refreshListenable: _SessionRefresh(ref),
    redirect: (context, state) {
      final session = ref.read(sessionProvider);
      final here = state.matchedLocation;
      final next = state.uri.queryParameters[nextParam];

      if (!session.isKnown) {
        return here == startingRoute
            ? null
            : _withNext(startingRoute, state.uri.toString());
      }

      // The session just resolved; send them where they were going.
      if (here == startingRoute) {
        return session.isAuthenticated
            ? (next ?? '/')
            : _withNext(loginRoute, next);
      }

      if (!session.isAuthenticated) {
        return here == loginRoute
            ? null
            : _withNext(loginRoute, state.uri.toString());
      }

      // Signed in and sitting on /login — either they just authenticated or
      // they typed the address. Either way, forward to `next`, else home.
      if (here == loginRoute) return next ?? '/';

      return null;
    },
    routes: [
      GoRoute(
        path: startingRoute,
        builder: (context, state) =>
            const Scaffold(backgroundColor: LibraColors.bg),
      ),
      GoRoute(
        path: loginRoute,
        builder: (context, state) => const LoginScreen(),
      ),
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

/// Bridges Riverpod's session to `go_router`'s [Listenable] refresh.
class _SessionRefresh extends ChangeNotifier {
  _SessionRefresh(Ref ref) {
    _subscription = ref.listen<SessionState>(
      sessionProvider,
      (_, _) => notifyListeners(),
    );
  }

  late final ProviderSubscription<SessionState> _subscription;

  @override
  void dispose() {
    _subscription.close();
    super.dispose();
  }
}

/// Where the router starts. Overridden by tests to open the app directly on a
/// route; in the app it is always `/`, because the browser's own address bar is
/// what deep-links in production.
final initialLocationProvider = Provider<String>((ref) => '/');

final routerProvider = Provider<GoRouter>((ref) {
  final router = buildRouter(
    ref,
    initialLocation: ref.read(initialLocationProvider),
  );
  ref.onDispose(router.dispose);
  return router;
});
