/// Login, the route guard, and the `?next=` round trip — driven through the
/// whole app, because the interesting behaviour is the redirect, not the form.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/exceptions.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/models.dart';
import 'package:libra_client/library/book_card.dart';
import 'package:libra_client/shell/sidebar.dart';

import 'helpers.dart';

Future<void> _signIn(
  WidgetTester tester, {
  String username = 'eugene',
  String password = 'correct-horse',
}) async {
  await tester.enterText(find.byType(TextField).first, username);
  await tester.enterText(find.byType(TextField).last, password);
  await tester.pump();
  await tester.tap(find.text('Sign In'));
  await pumpUntilSessionKnown(tester);
}

FakeLibraApi _withOneBook() => FakeLibraApi(
  signedIn: true,
  books: const [
    Book(id: 1, title: 'Dune', author: 'Frank Herbert', format: 'epub'),
  ],
);

void main() {
  group('the guard', () {
    testWidgets('sends an anonymous reader to /login', (tester) async {
      await pumpApp(tester, api: FakeLibraApi());

      expect(find.text('Libra'), findsOneWidget);
      expect(find.byType(LibraSidebar), findsNothing);
    });

    testWidgets('a deep link followed while signed out claims nothing', (
      tester,
    ) async {
      // Following a shared link is not an expiry. The old copy keyed off
      // `?next=`, so someone who had never logged in was told their session
      // had ended.
      await pumpApp(tester, api: FakeLibraApi(), at: '/books/7');

      expect(find.text('Libra'), findsOneWidget);
      expect(
        find.text('Your session expired. Please sign in again.'),
        findsNothing,
      );
    });

    testWidgets('an expiry says so, even with no next to carry', (
      tester,
    ) async {
      // The mirror-image bug: the library is where these routes send people,
      // so an expiry there carries no `next` — and used to show no message at
      // all, which is the case it matters most in.
      final api = _withOneBook();
      await pumpApp(tester, api: api, at: '/library');
      expect(find.byType(LibraSidebar), findsOneWidget);

      // Opening the book is a real request, which is what a session ending
      // underneath a reader actually looks like.
      api.failAlwaysWith = const Unauthorized();
      await tester.tap(find.byType(BookCard).first);
      await pumpUntilSessionKnown(tester);

      expect(
        find.text('Your session expired. Please sign in again.'),
        findsOneWidget,
      );
    });

    testWidgets('signing back in clears the claim', (tester) async {
      final api = _withOneBook();
      await pumpApp(tester, api: api, at: '/library');
      api.failAlwaysWith = const Unauthorized();
      await tester.tap(find.byType(BookCard).first);
      await pumpUntilSessionKnown(tester);
      expect(
        find.text('Your session expired. Please sign in again.'),
        findsOneWidget,
      );

      api
        ..failAlwaysWith = null
        ..signedIn = false;
      await _signIn(tester);

      expect(find.byType(LibraSidebar), findsOneWidget);
      expect(
        find.text('Your session expired. Please sign in again.'),
        findsNothing,
      );
    });

    testWidgets('lets a signed-in reader through', (tester) async {
      await pumpApp(tester, api: FakeLibraApi(signedIn: true), at: '/shelves');

      expect(find.byType(LibraSidebar), findsOneWidget);
      expect(find.text('No shelves yet'), findsOneWidget);
    });
  });

  group('the form', () {
    testWidgets('submit is inert until both fields are filled', (tester) async {
      await pumpApp(tester, api: FakeLibraApi());

      FilledButton button() =>
          tester.widget<FilledButton>(find.byType(FilledButton));
      expect(button().onPressed, isNull);

      await tester.enterText(find.byType(TextField).first, 'eugene');
      await tester.pump();
      expect(button().onPressed, isNull, reason: 'password still empty');

      await tester.enterText(find.byType(TextField).last, 'correct-horse');
      await tester.pump();
      expect(button().onPressed, isNotNull);
    });

    testWidgets('a bad password never says which field was wrong', (
      tester,
    ) async {
      await pumpApp(tester, api: FakeLibraApi());
      await _signIn(tester, password: 'wrong');

      expect(find.text('Incorrect username or password.'), findsOneWidget);
      // The backend pays for a dummy Argon2 verification on an unknown username
      // precisely so response timing cannot reveal whether an account exists.
      // The copy must not give away in plain text what that conceals.
      for (final leak in const [
        'No such user',
        'Unknown user',
        'User not found',
        'Wrong password',
        'Incorrect password',
      ]) {
        expect(
          find.textContaining(leak, findRichText: true),
          findsNothing,
          reason: '"$leak" would say which of the two was wrong',
        );
      }
      expect(find.byType(LibraSidebar), findsNothing);
    });

    testWidgets('an unreachable server is not reported as a bad password', (
      tester,
    ) async {
      final api = FakeLibraApi();
      await pumpApp(tester, api: api);
      // Set after the cold-load probe has been answered, so this fails the
      // login itself rather than being eaten by `GET /auth/me`.
      api.failNextWith = const NetworkFailure();
      await _signIn(tester);

      expect(find.text('Could not reach the library server.'), findsOneWidget);
      expect(find.text('Incorrect username or password.'), findsNothing);
    });

    testWidgets('Enter submits from the password field', (tester) async {
      await pumpApp(tester, api: FakeLibraApi());

      await tester.enterText(find.byType(TextField).first, 'eugene');
      await tester.enterText(find.byType(TextField).last, 'correct-horse');
      await tester.pump();
      await tester.testTextInput.receiveAction(TextInputAction.go);
      await pumpUntilSessionKnown(tester);

      expect(find.byType(LibraSidebar), findsOneWidget);
    });
  });

  group('after signing in', () {
    testWidgets('lands on the library by default', (tester) async {
      await pumpApp(tester, api: FakeLibraApi());
      await _signIn(tester);

      expect(find.byType(LibraSidebar), findsOneWidget);
      expect(find.text('Your library is empty'), findsOneWidget);
    });

    testWidgets('returns to next rather than the library', (tester) async {
      await pumpApp(tester, api: FakeLibraApi(), at: '/shelves');
      await _signIn(tester);

      // The whole point of carrying `next`: a reader whose session expired
      // mid-task comes back to the task.
      expect(find.text('No shelves yet'), findsOneWidget);
      expect(find.text('Your library is empty'), findsNothing);
    });
  });

  group('signing out', () {
    testWidgets('returns to /login from the account menu', (tester) async {
      final api = FakeLibraApi(signedIn: true);
      await pumpApp(tester, api: api);

      await tester.tap(find.text('eugene'));
      await tester.pump();
      expect(find.text('Sign Out'), findsOneWidget);

      await tester.tap(find.text('Sign Out'));
      await pumpUntilSessionKnown(tester);

      expect(api.calls, contains('logout'));
      expect(find.byType(LibraSidebar), findsNothing);
      expect(find.text('Libra'), findsOneWidget);
    });

    // Two tests rather than one that pumps two apps: replacing a mounted
    // MaterialApp.router mid-test leaves the outgoing router's shell navigator
    // and the incoming one's briefly sharing the tree.
    testWidgets('an ordinary reader gets no Manage Users', (tester) async {
      await pumpApp(tester, api: FakeLibraApi(signedIn: true));

      await tester.tap(find.text('eugene'));
      await tester.pump();

      expect(find.text('Sign Out'), findsOneWidget);
      expect(find.text('Manage Users'), findsNothing);
    });

    testWidgets('an admin gets Manage Users', (tester) async {
      await pumpApp(tester, api: FakeLibraApi(user: testAdmin, signedIn: true));

      await tester.tap(find.text('ada'));
      await tester.pump();

      expect(find.text('Manage Users'), findsOneWidget);
    });
  });
}
