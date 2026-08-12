/// The search field, driven through the router — because the thing that broke
/// it was not the field but how the library screen mounted it.
///
/// The field had no tests at all, and the gap was not academic: it was rebuilt
/// from scratch every time the debounce fired, so the caret vanished after the
/// 300ms pause the debounce exists to allow. Every assertion here is about
/// *identity across a filter change* — that the same State, the same controller
/// and the same focus survive the route the field itself caused.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/models.dart';
import 'package:libra_client/library/book_card.dart';
import 'package:libra_client/library/search_field.dart';

import '../helpers.dart';

const _dune = Book(
  id: 1,
  title: 'Dune',
  author: 'Frank Herbert',
  format: 'epub',
  tagIds: [10],
);
const _emma = Book(id: 2, title: 'Emma', author: 'Jane Austen', format: 'epub');

const _scifi = Tag(id: 10, name: 'scifi', bookCount: 1);

FakeLibraApi _library() =>
    FakeLibraApi(signedIn: true, books: [_dune, _emma], tags: [_scifi]);

Finder get _field => find.byType(TextField).first;

/// Whether the reader could keep typing — the question the bug got wrong.
bool _hasFocus(WidgetTester tester) =>
    tester.widget<TextField>(_field).focusNode?.hasFocus ?? false;

/// Lets the debounce fire and the route it pushes land.
Future<void> _settleDebounce(WidgetTester tester) async {
  await tester.pump(searchDebounce);
  await pumpUntilSessionKnown(tester);
}

/// Drives the browser back button, which arrives as a `pushRouteInformation`
/// platform message rather than as a Navigator pop — `context.go` replaces the
/// stack, so there is nothing to pop.
Future<void> _browserBackTo(WidgetTester tester, String location) async {
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(
    'flutter/navigation',
    const JSONMethodCodec().encodeMethodCall(
      MethodCall('pushRouteInformation', {'location': location}),
    ),
    (_) {},
  );
  await pumpUntilSessionKnown(tester);
}

void main() {
  group('typing reaches the server, once', () {
    testWidgets('a debounced query is sent as q', (tester) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library');

      await tester.enterText(_field, 'dune');
      await _settleDebounce(tester);

      expect(api.lastQuery?.query, 'dune');
      expect(find.byType(BookCard), findsOneWidget);
    });

    testWidgets('keystrokes before the pause send nothing', (tester) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library');

      await tester.enterText(_field, 'd');
      await tester.pump(const Duration(milliseconds: 100));
      await tester.enterText(_field, 'du');
      await tester.pump(const Duration(milliseconds: 100));

      // Still mid-word: pushing a route per keystroke is what would fill the
      // browser's history with half-typed words.
      expect(api.lastQuery?.query, isNot('d'));
      expect(api.lastQuery?.query, isNot('du'));
    });
  });

  group('the field survives the route it causes', () {
    testWidgets('focus outlives the debounce firing', (tester) async {
      // The regression. Keying the field by the applied query rebuilt it on
      // every filter change, so a reader who paused mid-word lost the caret and
      // typed the rest into nothing.
      await pumpApp(tester, api: _library(), at: '/library');

      await tester.tap(_field);
      await tester.pump();
      await tester.enterText(_field, 'du');
      expect(_hasFocus(tester), isTrue, reason: 'focused before the pause');

      await _settleDebounce(tester);

      expect(
        _hasFocus(tester),
        isTrue,
        reason: 'the reader paused; they did not click away',
      );
    });

    testWidgets('it is the same State, not a replacement', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library');
      final before = tester.state(find.byType(LibrarySearchField));

      await tester.enterText(_field, 'du');
      await _settleDebounce(tester);

      // Asserted directly, because focus is a symptom and this is the cause:
      // a new State means a new FocusNode and a new controller, and the field's
      // own `didUpdateWidget` never runs at all.
      expect(
        identical(before, tester.state(find.byType(LibrarySearchField))),
        isTrue,
      );
    });

    testWidgets('the text is not clobbered by the query it just sent', (
      tester,
    ) async {
      await pumpApp(tester, api: _library(), at: '/library');

      await tester.enterText(_field, 'dune');
      await _settleDebounce(tester);

      expect(tester.widget<TextField>(_field).controller?.text, 'dune');
    });
  });

  group('a filter changed from elsewhere still reaches the field', () {
    testWidgets('the back button empties the text', (tester) async {
      // What the key was there for, and the case its removal had to keep
      // working. `didUpdateWidget` does it instead — and can only do it because
      // the State now survives long enough to receive the new query.
      await pumpApp(tester, api: _library(), at: '/library?q=dune');
      expect(tester.widget<TextField>(_field).controller?.text, 'dune');

      await _browserBackTo(tester, '/library');

      expect(tester.widget<TextField>(_field).controller?.text, '');
      expect(find.byType(BookCard), findsNWidgets(2));
    });

    testWidgets('opening a filtered link seeds the text', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library?q=emma');

      expect(tester.widget<TextField>(_field).controller?.text, 'emma');
    });
  });

  group('#tag autocomplete', () {
    testWidgets('a trailing token suggests matching tags', (tester) async {
      await pumpApp(tester, api: _library(), at: '/library');

      await tester.enterText(_field, '#sci');
      await tester.pump();

      expect(find.text('#scifi'), findsWidgets);
    });

    testWidgets('accepting one lifts it out of the text into a filter', (
      tester,
    ) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library');

      await tester.enterText(_field, '#sci');
      await tester.pump();
      // The suggestion row, not the sidebar's tag of the same name.
      await tester.tap(
        find
            .descendant(
              of: find.byType(LibrarySearchField),
              matching: find.text('#scifi'),
            )
            .first,
      );
      await pumpUntilSessionKnown(tester);

      expect(api.lastQuery?.tagIds, [10]);
      // The field holds free text only — the tag is a pill now, not something
      // the reader has to keep intact while typing around it.
      expect(tester.widget<TextField>(_field).controller?.text.trim(), '');
    });

    testWidgets('a completed token becomes a filter without a click', (
      tester,
    ) async {
      final api = _library();
      await pumpApp(tester, api: api, at: '/library');

      // The space is the reader saying "that word is finished".
      await tester.enterText(_field, '#scifi ');
      await pumpUntilSessionKnown(tester);

      expect(api.lastQuery?.tagIds, [10]);
    });
  });
}
