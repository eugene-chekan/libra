/// The routes are the thing the design prototype did not have: linkable, with
/// a working back button, and a shell that survives navigation.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/router.dart';
import 'package:libra_client/session/session.dart';
import 'package:libra_client/shell/sidebar.dart';
import 'package:libra_client/theme/theme.dart';

import 'helpers.dart';

const _reader = SessionUser(id: 2, username: 'eugene', isAdmin: false);

Future<void> pumpApp(WidgetTester tester, {String at = '/'}) async {
  useDesignViewport(tester);
  final router = buildRouter(initialLocation: at);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      // A resolved session, so the account row is not showing its skeleton.
      // That skeleton pulses forever by design, and `pumpAndSettle` waits for
      // an idle frame that would never come.
      overrides: [sessionProvider.overrideWithValue(_reader)],
      child: MaterialApp.router(theme: buildLibraTheme(), routerConfig: router),
    ),
  );
  await tester.pump();
}

void main() {
  testWidgets('the shell wraps the signed-in routes', (tester) async {
    await pumpApp(tester);

    expect(find.byType(LibraSidebar), findsOneWidget);
    expect(find.text('Library'), findsWidgets);
  });

  testWidgets('login sits outside the shell', (tester) async {
    // It has no sidebar, and there is nothing to sign out of yet.
    await pumpApp(tester, at: '/login');

    expect(find.byType(LibraSidebar), findsNothing);
  });

  testWidgets('each route resolves to its own screen', (tester) async {
    await pumpApp(tester, at: '/shelves');
    expect(find.text('Shelves arrives with #28.'), findsOneWidget);

    await pumpApp(tester, at: '/chat');
    expect(find.text('Librarian arrives with #32.'), findsOneWidget);

    await pumpApp(tester, at: '/books/7');
    expect(find.text('Book arrives with #27.'), findsOneWidget);
  });

  testWidgets('a nav row changes the route under one shell', (tester) async {
    await pumpApp(tester);
    expect(find.text('Library arrives with #26.'), findsOneWidget);

    await tester.tap(find.text('Shelves'));
    await tester.pumpAndSettle();

    expect(find.text('Shelves arrives with #28.'), findsOneWidget);
    expect(find.text('Library arrives with #26.'), findsNothing);
    // One sidebar throughout: the content pane swapped inside the shell rather
    // than the whole frame being rebuilt.
    expect(find.byType(LibraSidebar), findsOneWidget);
  });

  testWidgets('the browser back button works', (tester) async {
    await pumpApp(tester);

    await tester.tap(find.text('Shelves'));
    await tester.pumpAndSettle();
    expect(find.text('Shelves arrives with #28.'), findsOneWidget);

    await _browserNavigateTo(tester, '/');

    expect(find.text('Library arrives with #26.'), findsOneWidget);
  });

  testWidgets('an unknown address gets the not-found page', (tester) async {
    await pumpApp(tester, at: '/nope');

    expect(find.text('No such page'), findsOneWidget);
  });
}

/// Drives back/forward the way a browser does.
///
/// Not a Navigator pop: `context.go` replaces the route stack rather than
/// pushing onto it, so there is nothing to pop and `handlePopRoute` reports as
/// much. Flutter web delivers browser history moves as a `pushRouteInformation`
/// platform message, which is what this sends.
Future<void> _browserNavigateTo(WidgetTester tester, String location) async {
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
    'flutter/navigation',
    const JSONMethodCodec().encodeMethodCall(
      MethodCall('pushRouteInformation', {'location': location}),
    ),
    (_) {},
  );
  await tester.pumpAndSettle();
}
