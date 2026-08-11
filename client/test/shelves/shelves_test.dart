/// The shelves page and its manager.
///
/// The rules worth pinning are about *other people's* shelves: they appear,
/// they are labelled, and nothing on them can be edited. Everything else is
/// ordinary CRUD.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/models.dart';

import '../helpers.dart';

const _mine = Shelf(
  id: 1,
  name: 'To Read',
  ownerId: 1,
  ownerUsername: 'eugene',
  position: 0,
  editable: true,
);
const _alsoMine = Shelf(
  id: 2,
  name: 'Finished',
  ownerId: 1,
  ownerUsername: 'eugene',
  position: 1,
  editable: true,
);
const _published = Shelf(
  id: 3,
  name: 'Favourites',
  ownerId: 1,
  ownerUsername: 'eugene',
  position: 2,
  visibility: 'public',
  editable: true,
);
const _theirs = Shelf(
  id: 9,
  name: 'Ada\'s picks',
  ownerId: 2,
  ownerUsername: 'ada',
  visibility: 'public',
);

FakeLibraApi _api({List<Shelf> shelves = const [_mine, _alsoMine]}) =>
    FakeLibraApi(signedIn: true, shelves: shelves);

void main() {
  group('the page', () {
    testWidgets('lists the reader\'s shelves', (tester) async {
      await pumpApp(tester, api: _api(), at: '/shelves');

      expect(find.text('To Read'), findsWidgets);
      expect(find.text('Finished'), findsWidgets);
    });

    testWidgets('keeps the order the server sent', (tester) async {
      // That order is the reader's own arrangement; re-sorting it client-side
      // would throw away the one thing this screen lets them control.
      final api = _api(shelves: [_alsoMine, _mine]);
      await pumpApp(tester, api: api, at: '/shelves');

      final names = tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data)
          .where((d) => d == 'To Read' || d == 'Finished')
          .toList();
      expect(names.first, 'Finished');
    });

    testWidgets('says an empty shelf is empty', (tester) async {
      await pumpApp(tester, api: _api(), at: '/shelves');

      expect(find.text('Nothing on this shelf yet.'), findsWidgets);
    });

    testWidgets('marks a public shelf and leaves private ones unmarked', (
      tester,
    ) async {
      // Private is the default and the common case; the pill marks the shelf
      // that is not the norm.
      await pumpApp(
        tester,
        api: _api(shelves: [_mine, _published]),
        at: '/shelves',
      );

      expect(find.text('Public'), findsOneWidget);
    });
  });

  group('other people\'s shelves', () {
    testWidgets('appear under their own heading, named', (tester) async {
      await pumpApp(
        tester,
        api: _api(shelves: [_mine, _theirs]),
        at: '/shelves',
      );

      expect(find.text('SHARED WITH YOU'), findsWidgets);
      expect(find.text("Ada's picks"), findsWidgets);
      expect(find.text('· by ada'), findsOneWidget);
    });

    testWidgets('the heading is absent when nobody has shared', (tester) async {
      // No zero state: on a single-user instance the section should not exist.
      await pumpApp(tester, api: _api(), at: '/shelves');

      expect(find.text('SHARED WITH YOU'), findsNothing);
    });

    testWidgets('carry no edit affordances in the manager', (tester) async {
      await pumpApp(
        tester,
        api: _api(shelves: [_mine, _theirs]),
        at: '/shelves',
      );

      await tester.tap(find.text('Manage Shelves'));
      await pumpUntilSessionKnown(tester);

      // The manager is for shelves the reader owns; somebody else's is not
      // listed at all, rather than listed with everything disabled. Scoped to
      // the dialog, since the page behind it still shows the shared shelf —
      // which is the point: visible there, absent here.
      expect(find.text('1 shelf'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text("Ada's picks"),
        ),
        findsNothing,
      );
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.text('To Read'),
        ),
        findsOneWidget,
      );
    });
  });

  group('the manager', () {
    testWidgets('creates a shelf', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/shelves');
      await tester.tap(find.text('Manage Shelves'));
      await pumpUntilSessionKnown(tester);

      await tester.enterText(find.byType(TextField).last, 'Someday');
      await tester.tap(find.text('Add'));
      await pumpUntilSessionKnown(tester);

      expect(api.shelves.any((s) => s.name == 'Someday'), isTrue);
    });

    testWidgets('renames and publishes in one save', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/shelves');
      await tester.tap(find.text('Manage Shelves'));
      await pumpUntilSessionKnown(tester);

      await tester.tap(find.byIcon(Icons.edit_outlined).first);
      await tester.pump();
      await tester.enterText(find.byType(TextField).first, 'Next Up');
      await tester.tap(find.byType(Checkbox));
      await tester.pump();

      // The sentence appears only once publishing is actually chosen.
      expect(
        find.textContaining('Anyone with an account can see this shelf'),
        findsOneWidget,
      );

      await tester.tap(find.text('Save'));
      await pumpUntilSessionKnown(tester);

      final updated = api.shelves.firstWhere((s) => s.id == 1);
      expect(updated.name, 'Next Up');
      expect(updated.isPublic, isTrue);
    });

    testWidgets('reorders through one call carrying the whole order', (
      tester,
    ) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/shelves');
      await tester.tap(find.text('Manage Shelves'));
      await pumpUntilSessionKnown(tester);

      // The chevron path, which is the keyboard-reachable one; the drag is the
      // same call with the same payload.
      await tester.tap(find.byIcon(Icons.keyboard_arrow_down).first);
      await pumpUntilSessionKnown(tester);

      expect(api.calls, contains('reorderShelves'));
      expect([for (final s in api.shelves) s.id], [2, 1]);
    });

    testWidgets('deleting asks first, in a real dialog', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/shelves');
      await tester.tap(find.text('Manage Shelves'));
      await pumpUntilSessionKnown(tester);

      await tester.tap(find.byIcon(Icons.delete_outline).first);
      await tester.pump();

      expect(find.text('Delete To Read?'), findsOneWidget);
      // Says what survives it, because that is the question being asked.
      expect(
        find.textContaining('the books on it stay in your library'),
        findsOneWidget,
      );

      await tester.tap(find.text('Cancel'));
      await pumpUntilSessionKnown(tester);
      expect(api.shelves.any((s) => s.id == 1), isTrue);
    });

    testWidgets('confirming actually deletes', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/shelves');
      await tester.tap(find.text('Manage Shelves'));
      await pumpUntilSessionKnown(tester);

      await tester.tap(find.byIcon(Icons.delete_outline).first);
      await tester.pump();
      await tester.tap(find.text('Delete'));
      await pumpUntilSessionKnown(tester);

      expect(api.shelves.any((s) => s.id == 1), isFalse);
    });
  });
}
