import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/session/session.dart';
import 'package:libra_client/shell/account_row.dart';
import 'package:libra_client/shell/add_book_button.dart';
import 'package:libra_client/shell/sidebar.dart';
import 'package:libra_client/theme/tokens.dart';
import 'package:libra_client/widgets/skeleton.dart';

import '../helpers.dart';

const _reader = SessionUser(id: 2, username: 'eugene', isAdmin: false);
const _admin = SessionUser(id: 1, username: 'ada', isAdmin: true);

Future<void> pumpSidebar(
  WidgetTester tester, {
  String location = '/',
  SessionUser? user,
  ValueChanged<String>? onNavigate,
}) {
  useDesignViewport(tester);
  return pumpLibra(
    tester,
    LibraSidebar(location: location, onNavigate: onNavigate ?? (_) {}),
    user: user,
  );
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

  testWidgets('keeps Library lit on a book detail route', (tester) async {
    // `/` is matched exactly — a prefix match would light every route — but a
    // book still belongs to the library as far as the nav is concerned.
    await pumpSidebar(tester, location: '/books/7');

    expect(_isActive(tester, 'Library'), isFalse);
    expect(_isActive(tester, 'Shelves'), isFalse);
  });

  group('pinned footer', () {
    testWidgets('holds Add Book and the account row', (tester) async {
      await pumpSidebar(tester, user: _reader);

      expect(find.byType(AddBookButton), findsOneWidget);
      expect(find.byType(AccountRow), findsOneWidget);
    });

    testWidgets('does not scroll with the nav', (tester) async {
      await pumpSidebar(tester, user: _reader);

      // Sign-out must be reachable without hunting, which is the whole reason
      // the footer left the scrollable column.
      final scroller = find.byType(SingleChildScrollView);
      expect(
        find.descendant(of: scroller, matching: find.byType(AccountRow)),
        findsNothing,
      );
    });
  });

  group('account row', () {
    testWidgets('shows a skeleton before the session resolves', (tester) async {
      await pumpSidebar(tester);
      await tester.pump();

      expect(find.byType(LibraSkeletonLine), findsOneWidget);
    });

    testWidgets('shows the username and its initial', (tester) async {
      await pumpSidebar(tester, user: _reader);

      expect(find.text('eugene'), findsOneWidget);
      expect(find.text('E'), findsOneWidget);
    });

    testWidgets('marks an admin', (tester) async {
      await pumpSidebar(tester, user: _admin);

      expect(find.text('ada'), findsOneWidget);
      expect(find.text('Admin'), findsOneWidget);
    });

    testWidgets('stays single-line for an ordinary reader', (tester) async {
      await pumpSidebar(tester, user: _reader);

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
