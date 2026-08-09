/// The session controller, without widgets.
///
/// The expiry rule gets the most attention here because it is the only state
/// the whole application shares and the only one that appears without the
/// reader doing anything.
library;

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/exceptions.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/session_guard.dart';
import 'package:libra_client/session/session.dart';

import 'helpers.dart';

void main() {
  group('cold load', () {
    test('resolves to the signed-in reader', () async {
      final container = apiContainer(FakeLibraApi(signedIn: true));
      final controller = container.read(sessionProvider.notifier);

      expect(container.read(sessionProvider).status, SessionStatus.unknown);

      await controller.restore();

      expect(container.read(sessionProvider).isAuthenticated, isTrue);
      expect(container.read(currentUserProvider)?.username, 'eugene');
    });

    test('a 401 means anonymous, not expired', () async {
      // The ordinary "not signed in" answer. If this were treated as an expiry
      // the login screen would claim a session ended every time someone opened
      // the app signed out.
      final container = apiContainer(FakeLibraApi());
      await container.read(sessionProvider.notifier).restore();

      expect(container.read(sessionProvider).status, SessionStatus.anonymous);
    });

    test('an unreachable server does not strand the app in unknown', () async {
      final api = FakeLibraApi(signedIn: true)
        ..failNextWith = const NetworkFailure();
      final container = apiContainer(api);

      await container.read(sessionProvider.notifier).restore();

      // Anonymous rather than unknown: the shell holds blank while unknown, so
      // staying there would be a permanently empty window.
      expect(container.read(sessionProvider).status, SessionStatus.anonymous);
    });
  });

  group('sign in and out', () {
    test('signs in with the right password', () async {
      final container = apiContainer(FakeLibraApi());
      await container
          .read(sessionProvider.notifier)
          .signIn(username: 'eugene', password: 'correct-horse');

      expect(container.read(sessionProvider).isAuthenticated, isTrue);
    });

    test('a wrong password throws Unauthorized and changes nothing', () async {
      final container = apiContainer(FakeLibraApi());
      final controller = container.read(sessionProvider.notifier);
      await controller.restore();

      await expectLater(
        controller.signIn(username: 'eugene', password: 'wrong'),
        throwsA(isA<Unauthorized>()),
      );
      expect(container.read(sessionProvider).isAuthenticated, isFalse);
    });

    test('sign-out revokes server-side, not just locally', () async {
      final api = FakeLibraApi(signedIn: true);
      final container = apiContainer(api);
      await container.read(sessionProvider.notifier).restore();

      await container.read(sessionProvider.notifier).signOut();

      // Clearing the cookie alone would leave a token that still works for
      // anyone who captured it.
      expect(api.calls, contains('logout'));
      expect(api.signedIn, isFalse);
      expect(container.read(sessionProvider).isAuthenticated, isFalse);
    });

    test('sign-out clears locally even when the call fails', () async {
      final api = FakeLibraApi(signedIn: true);
      final container = apiContainer(api);
      await container.read(sessionProvider.notifier).restore();
      api.failNextWith = const NetworkFailure();

      await container.read(sessionProvider.notifier).signOut();

      // The reader asked to be signed out; leaving them looking signed in
      // because the network hiccuped is the wrong failure.
      expect(container.read(sessionProvider).isAuthenticated, isFalse);
    });
  });

  group('expiry fires exactly once', () {
    test('the first 401 expires, later ones are no-ops', () async {
      final container = apiContainer(FakeLibraApi(signedIn: true));
      final controller = container.read(sessionProvider.notifier);
      await controller.restore();

      expect(controller.expire(), isTrue);
      expect(controller.expire(), isFalse);
      expect(controller.expire(), isFalse);
    });

    test('concurrent 401s expire the session exactly once', () async {
      // The case the spec calls out: not "a 401 redirects" but "a 401 during a
      // background refresh, while another request is in flight, redirects
      // exactly once". A naive implementation fires one per failed request.
      //
      // The assertion counts what `expire()` *reported*, not how many times
      // the provider notified. Notification count is not a sound proxy here:
      // the anonymous state is built from a `const` constructor, so repeated
      // assignments hand Riverpod the same canonical instance and get
      // suppressed for free. That would let a broken guard pass. Asking each
      // 401 whether it was the one that ended the session tests the guard
      // itself.
      final api = FakeLibraApi(signedIn: true);
      final container = apiContainer(api);
      final controller = container.read(sessionProvider.notifier);
      await controller.restore();

      final reports = <bool>[];
      final guarded = SessionAwareApi(
        inner: api,
        onUnauthorized: () => reports.add(controller.expire()),
      );

      // Three requests genuinely in flight together, all answered with 401.
      // The log is cleared first: the cold-load probe is already in it.
      final gate = Completer<void>();
      api
        ..calls.clear()
        ..gate = gate.future
        ..signedIn = false;

      final calls = [
        guarded.currentUser(),
        guarded.currentUser(),
        guarded.updateUser(1, kindleEmail: 'a@kindle.com'),
      ].map((f) => f.then<void>((_) {}).catchError((_) {}));

      gate.complete();
      await Future.wait(calls);

      expect(api.calls.length, 3, reason: 'all three really were sent');
      expect(reports, [true, false, false], reason: 'one redirect, not three');
      expect(container.read(sessionProvider).isAuthenticated, isFalse);
    });

    test('signing back in re-arms the guard', () async {
      final api = FakeLibraApi(signedIn: true);
      final container = apiContainer(api);
      final controller = container.read(sessionProvider.notifier);
      await controller.restore();

      expect(controller.expire(), isTrue);
      await controller.signIn(username: 'eugene', password: 'correct-horse');

      // A session that could only ever expire once would leave the second one
      // unprotected.
      expect(controller.expire(), isTrue);
    });
  });

  group('the guard wrapper', () {
    test('a rejected sign-in does not expire the session', () async {
      final api = FakeLibraApi(signedIn: true);
      final container = apiContainer(api);
      await container.read(sessionProvider.notifier).restore();

      await expectLater(
        container
            .read(libraApiProvider)
            .login(username: 'eugene', password: 'wrong'),
        throwsA(isA<Unauthorized>()),
      );

      // Still signed in: a bad password on some other form must not throw the
      // reader out of the session they already have.
      expect(container.read(sessionProvider).isAuthenticated, isTrue);
    });

    test('a 403 does not expire the session', () async {
      final api = FakeLibraApi(signedIn: true);
      final container = apiContainer(api);
      await container.read(sessionProvider.notifier).restore();

      await expectLater(
        container.read(libraApiProvider).updateUser(999),
        throwsA(isA<Forbidden>()),
      );

      // Signing in again would not help, so redirecting to /login would be a
      // loop with no exit.
      expect(container.read(sessionProvider).isAuthenticated, isTrue);
    });
  });
}
