import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/models.dart';
import 'package:libra_client/shell/account_row.dart';
import 'package:libra_client/shell/add_book_button.dart';
import 'package:libra_client/shell/sidebar.dart';
import 'package:libra_client/theme/tokens.dart';
import 'package:libra_client/widgets/skeleton.dart';

import '../helpers.dart';

Future<void> pumpSidebar(
  WidgetTester tester, {
  String location = '/',
  CurrentUser? user,
  bool signedIn = true,
  ValueChanged<String>? onNavigate,
  bool settle = true,
}) async {
  useDesignViewport(tester);
  await pumpLibra(
    tester,
    LibraSidebar(location: location, onNavigate: onNavigate ?? (_) {}),
    api: FakeLibraApi(user: user ?? testReader, signedIn: signedIn),
    settle: false,
  );
  if (settle) await pumpUntilSessionKnown(tester);
}

void main() {
  testWidgets('shows the three primary nav rows', (tester) async {
    await pumpSidebar(tester);

    expect(find.text('Library'), findsOneWidget);
    expect(find.text('Shelves'), findsOneWidget);
    // The row `client-design.md` adds — the chat had no way in before it.
    expect(find.text('Librarian'), findsOneWidget);
  });

  testWidgets('navigates on tap', (tester) async {
    final taps = <String>[];
    await pumpSidebar(tester, onNavigate: taps.add);

    await tester.tap(find.text('Librarian'));
    expect(taps, ['/chat']);
  });

  testWidgets('lights exactly one row', (tester) async {
    await pumpSidebar(tester, location: '/shelves');

    expect(_isActive(tester, 'Shelves'), isTrue);
    expect(_isActive(tester, 'Library'), isFalse);
    expect(_isActive(tester, 'Librarian'), isFalse);
  });

  testWidgets('keeps Library unlit on a book detail route', (tester) async {
    // `/` is matched exactly — a prefix match would light every route.
    await pumpSidebar(tester, location: '/books/7');

    expect(_isActive(tester, 'Library'), isFalse);
    expect(_isActive(tester, 'Shelves'), isFalse);
  });

  group('pinned footer', () {
    testWidgets('holds Add Book and the account row', (tester) async {
      await pumpSidebar(tester);

      expect(find.byType(AddBookButton), findsOneWidget);
      expect(find.byType(AccountRow), findsOneWidget);
    });

    testWidgets('does not scroll with the nav', (tester) async {
      await pumpSidebar(tester);

      // Sign-out must be reachable without hunting, which is the whole reason
      // the footer left the scrollable column.
      expect(
        find.descendant(
          of: find.byType(SingleChildScrollView),
          matching: find.byType(AccountRow),
        ),
        findsNothing,
      );
    });
  });

  group('account row', () {
    testWidgets('shows a skeleton before the session resolves', (tester) async {
      // No settle: this is the cold-load window, before `/auth/me` answers.
      await pumpSidebar(tester, settle: false);

      expect(find.byType(LibraSkeletonLine), findsOneWidget);
      expect(find.text('eugene'), findsNothing);
    });

    testWidgets('shows the username and its initial', (tester) async {
      await pumpSidebar(tester);

      expect(find.text('eugene'), findsOneWidget);
      expect(find.text('E'), findsOneWidget);
    });

    testWidgets('marks an admin', (tester) async {
      await pumpSidebar(tester, user: testAdmin);

      expect(find.text('ada'), findsOneWidget);
      expect(find.text('Admin'), findsOneWidget);
    });

    testWidgets('stays single-line for an ordinary reader', (tester) async {
      await pumpSidebar(tester);

      expect(find.text('Admin'), findsNothing);
    });
  });
}

/// The active row is the one filled `accentLight`.
bool _isActive(WidgetTester tester, String label) {
  final containers = tester.widgetList<AnimatedContainer>(
    find.ancestor(
      of: find.text(label),
      matching: find.byType(AnimatedContainer),
    ),
  );
  return containers.any((c) {
    final decoration = c.decoration as BoxDecoration?;
    return decoration?.color == LibraColors.accentLight;
  });
}
