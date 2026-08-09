/// An in-memory [LibraApi] with real behaviour and no socket.
///
/// It lives in `lib/` rather than `test/` on purpose: `flutter run` can be
/// pointed at it to build a screen before its endpoint exists, and #32's
/// stubbed librarian will need exactly this. It is also what makes "no test
/// needs a running backend" true rather than aspirational.
///
/// It enforces the rules the real server enforces — credentials must match, an
/// unauthenticated call throws [Unauthorized] — because a fake that says yes to
/// everything tests nothing.
library;

import 'exceptions.dart';
import 'libra_api.dart';
import 'models.dart';

class FakeLibraApi implements LibraApi {
  FakeLibraApi({
    CurrentUser? user,
    this.password = 'correct-horse',
    this.signedIn = false,
  }) : user =
           user ??
           const CurrentUser(
             id: 1,
             username: 'eugene',
             isAdmin: false,
             kindleSender: 'libra@example.com',
           );

  CurrentUser user;

  /// The one password [login] accepts. Anything else throws [Unauthorized],
  /// exactly as a wrong password and an unknown username both do server-side.
  final String password;

  /// Whether a session is live. Public and mutable so a test can start
  /// already signed in without going through [login].
  bool signedIn;

  /// Set to make the next call fail, so a test can drive the expiry path
  /// without unwinding the whole session. Cleared once thrown, so it models a
  /// single stale request rather than a permanently broken server.
  ApiException? failNextWith;

  /// Every call, in order — lets a test assert that logout actually reached the
  /// server rather than only clearing local state.
  final calls = <String>[];

  /// Gate for the concurrency test: when set, calls await it before answering,
  /// so several requests can be genuinely in flight at once.
  Future<void>? gate;

  Future<T> _call<T>(String name, T Function() body) async {
    calls.add(name);
    if (gate != null) await gate;

    final failure = failNextWith;
    if (failure != null) {
      failNextWith = null;
      if (failure is Unauthorized) signedIn = false;
      throw failure;
    }
    return body();
  }

  void _requireSession() {
    if (!signedIn) throw const Unauthorized();
  }

  @override
  Future<CurrentUser> login({
    required String username,
    required String password,
  }) => _call('login', () {
    if (username.trim().toLowerCase() != user.username ||
        password != this.password) {
      // One exception for both cases, as the server gives one message for
      // both — the client must not be able to tell them apart either.
      throw const Unauthorized('Invalid username or password');
    }
    signedIn = true;
    return user;
  });

  @override
  Future<void> logout() => _call('logout', () {
    _requireSession();
    signedIn = false;
  });

  @override
  Future<CurrentUser> currentUser() => _call('currentUser', () {
    _requireSession();
    return user;
  });

  @override
  Future<CurrentUser> updateUser(int id, {String? kindleEmail}) =>
      _call('updateUser', () {
        _requireSession();
        if (id != user.id) throw const Forbidden();
        user = user.copyWith(
          kindleEmail: kindleEmail,
          clearKindleEmail: kindleEmail == null,
        );
        return user;
      });
}
