/// The signed-in reader, and the one piece of state the whole app shares.
///
/// Three states, not two: [SessionStatus.unknown] is the cold-load window
/// before `GET /auth/me` answers. Collapsing it into "signed out" would bounce
/// every reader to `/login` for a frame on every refresh, and collapsing it
/// into "signed in" would flash the library at someone who is not.
///
/// **The expiry rule is the delicate part.** Any 401 from any request clears
/// state and redirects to `/login?next=…`, and it must do so *exactly once*
/// however many requests were in flight. The naive version — each call site
/// reacting to its own 401 — fires one redirect per failed request, which on a
/// screen doing three parallel loads means three redirects and a `next` taken
/// from whichever lost the race. [expire] is therefore idempotent: the first
/// 401 captures `next` and moves the state, and every later one is a no-op
/// until the next successful sign-in re-arms it.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/exceptions.dart';
import '../api/models.dart';
import '../api/providers.dart';

enum SessionStatus {
  /// Before `/auth/me` has answered. Renders as loading, never as either
  /// signed-in or signed-out.
  unknown,
  authenticated,
  anonymous,
}

class SessionState {
  const SessionState({required this.status, this.user});

  const SessionState.unknown() : this(status: SessionStatus.unknown);

  final SessionStatus status;
  final CurrentUser? user;

  bool get isAuthenticated => status == SessionStatus.authenticated;
  bool get isKnown => status != SessionStatus.unknown;
}

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    // Deliberately not awaited: `build` must return synchronously, and the
    // router reads `unknown` until this lands.
    Future.microtask(restore);
    return const SessionState.unknown();
  }

  Future<void>? _restoring;

  /// Cold-load probe. A 401 here is the ordinary "not signed in" answer, not an
  /// expiry — there is no route to return to and no session was lost, so
  /// treating it as one would have the login screen claim a session expired
  /// every time someone opens the app signed out.
  ///
  /// Concurrent calls share one request. Without that, the constructor's probe
  /// and any explicit call both hit `/auth/me` and both assign state, so a
  /// listener sees two changes where one happened — and the router would run
  /// its redirect twice for a single cold load.
  Future<void> restore() =>
      _restoring ??= _restore().whenComplete(() => _restoring = null);

  Future<void> _restore() async {
    try {
      final user = await ref.read(apiProvider).currentUser();
      state = SessionState(status: SessionStatus.authenticated, user: user);
    } on ApiException {
      state = const SessionState(status: SessionStatus.anonymous);
    }
  }

  /// Throws [Unauthorized] on bad credentials, for the login screen to render.
  /// Any other [ApiException] — including [NetworkFailure] — propagates too, so
  /// "the server is unreachable" is not shown as "wrong password".
  Future<void> signIn({
    required String username,
    required String password,
  }) async {
    final user = await ref
        .read(apiProvider)
        .login(username: username, password: password);
    // Moving off `anonymous` is what re-arms [expire] for the next session.
    state = SessionState(status: SessionStatus.authenticated, user: user);
  }

  /// Revokes server-side, then clears locally.
  ///
  /// Local state is cleared even if the call fails: the reader asked to be
  /// signed out, and leaving them looking signed in because the network
  /// hiccuped is the wrong failure. The server-side row may survive, which is
  /// why it is attempted first rather than skipped.
  Future<void> signOut() async {
    try {
      await ref.read(apiProvider).logout();
    } on ApiException {
      // Already gone server-side, or unreachable. Either way, clear locally.
    }
    state = const SessionState(status: SessionStatus.anonymous);
  }

  /// Records a 401 from anywhere. Idempotent by design — see the library note.
  ///
  /// Returning early rather than reassigning an equal state is the whole
  /// mechanism: an assignment would notify listeners, the router would run its
  /// redirect again, and three in-flight requests would produce three
  /// redirects. Returns true only for the call that actually expired the
  /// session, which is what the concurrency test asserts on.
  bool expire() {
    if (state.status == SessionStatus.anonymous) return false;
    state = const SessionState(status: SessionStatus.anonymous);
    return true;
  }

  /// Folds the current user's edits back in without a refetch — the Kindle
  /// address modal's `PATCH` already returns the updated row.
  void adopt(CurrentUser user) {
    if (!state.isAuthenticated) return;
    state = SessionState(status: SessionStatus.authenticated, user: user);
  }
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);

/// The signed-in reader, or null. What widgets actually want.
final currentUserProvider = Provider<CurrentUser?>(
  (ref) => ref.watch(sessionProvider).user,
);
