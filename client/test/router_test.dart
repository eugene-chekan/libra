/// The routes are the thing the design prototype did not have: linkable, with
/// a working back button, and a shell that survives navigation.
library;

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/models.dart';
import 'package:libra_client/shell/sidebar.dart';

import 'helpers.dart';

FakeLibraApi _signedIn() => FakeLibraApi(signedIn: true);

void main() {
  testWidgets('the shell wraps the signed-in routes', (tester) async {
    await pumpApp(tester, api: _signedIn());

    expect(find.byType(LibraSidebar), findsOneWidget);
    // `/` redirects to the library, which with no books shows its first-run
    // state rather than an empty grid.
    expect(find.text('Your library is empty'), findsOneWidget);
  });

  // One app per test: replacing a mounted MaterialApp.router leaves the
  // outgoing router's shell navigator and the incoming one's briefly sharing
  // the tree, which Flutter reports as a duplicate GlobalKey.
  testWidgets('/shelves resolves to the shelves screen', (tester) async {
    await pumpApp(tester, api: _signedIn(), at: '/shelves');
    expect(find.text('No shelves yet'), findsOneWidget);
  });

  testWidgets('/chat resolves to the librarian screen', (tester) async {
    await pumpApp(tester, api: _signedIn(), at: '/chat');
    expect(find.text('Librarian arrives with #32.'), findsOneWidget);
  });

  testWidgets('/books/:id resolves to the book screen', (tester) async {
    final api = _signedIn()
      ..books = const [
        Book(id: 7, title: 'Dune', author: 'Frank Herbert', format: 'epub'),
      ];
    await pumpApp(tester, api: api, at: '/books/7');

    expect(find.text('Dune'), findsWidgets);
    expect(find.text('READING PROGRESS'), findsOneWidget);
  });

  testWidgets('a book id that is not a number does not crash', (tester) async {
    await pumpApp(tester, api: _signedIn(), at: '/books/not-a-number');

    // A typed URL, not a bug — it must not take the parse down with it.
    expect(tester.takeException(), isNull);
  });

  testWidgets('a nav row changes the route under one shell', (tester) async {
    await pumpApp(tester, api: _signedIn());
    expect(find.text('Your library is empty'), findsOneWidget);

    await tester.tap(find.text('Shelves'));
    await pumpUntilSessionKnown(tester);

    expect(find.text('No shelves yet'), findsOneWidget);
    expect(find.text('Your library is empty'), findsNothing);
    // One sidebar throughout: the content pane swapped inside the shell rather
    // than the whole frame being rebuilt.
    expect(find.byType(LibraSidebar), findsOneWidget);
  });

  testWidgets('the browser back button works', (tester) async {
    await pumpApp(tester, api: _signedIn());

    await tester.tap(find.text('Shelves'));
    await pumpUntilSessionKnown(tester);
    expect(find.text('No shelves yet'), findsOneWidget);

    await _browserNavigateTo(tester, '/library');

    expect(find.text('Your library is empty'), findsOneWidget);
  });

  testWidgets('an unknown address gets the not-found page', (tester) async {
    await pumpApp(tester, api: _signedIn(), at: '/nope');

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
  await pumpUntilSessionKnown(tester);
}
