/// The book detail screen, driven through the router.
///
/// The distinction this file exists to pin down is *which writes commit
/// immediately and which wait for Save*. Getting that backwards is invisible
/// until someone's half-typed title is published to the whole household.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/exceptions.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/models.dart';
import 'package:libra_client/theme/tokens.dart';
import 'package:libra_client/widgets/upward_dropdown.dart';

import '../helpers.dart';

const _dune = Book(
  id: 1,
  title: 'Dune',
  author: 'Frank Herbert',
  format: 'epub',
  year: 1965,
  pages: 412,
  blurb: 'Desert planet politics.',
  tagIds: [10],
  rating: 3,
  progress: 0.42,
);
const _unread = Book(id: 2, title: 'Emma', author: 'Austen', format: 'epub');
const _finished = Book(
  id: 3,
  title: 'Ulysses',
  author: 'Joyce',
  format: 'epub',
  progress: 1,
);
const _shelved = Book(
  id: 4,
  title: 'Piranesi',
  author: 'Clarke',
  format: 'epub',
  shelfId: 5,
);

const _scifi = Tag(id: 10, name: 'scifi');
const _toRead = Shelf(id: 5, name: 'To Read', ownerId: 1, editable: true);

FakeLibraApi _api({CurrentUser? user}) => FakeLibraApi(
  signedIn: true,
  user: user,
  books: [_dune, _unread, _finished, _shelved],
  tags: [_scifi],
  shelves: [_toRead],
);

const _admin = CurrentUser(id: 1, username: 'eugene', isAdmin: true);
const _withKindle = CurrentUser(
  id: 1,
  username: 'eugene',
  isAdmin: false,
  kindleEmail: 'me@kindle.com',
);

void main() {
  group('view mode', () {
    testWidgets('shows what the file declared', (tester) async {
      await pumpApp(tester, api: _api(), at: '/books/1');

      expect(find.text('Dune'), findsWidgets);
      expect(find.text('Frank Herbert'), findsOneWidget);
      expect(find.text('Desert planet politics.'), findsOneWidget);
      expect(find.textContaining('1965'), findsOneWidget);
      expect(find.textContaining('412 pages'), findsOneWidget);
    });

    testWidgets('omits metadata the file did not declare', (tester) async {
      // Real libraries are full of imperfectly tagged files; a book with no
      // year shows none rather than an invented one.
      await pumpApp(tester, api: _api(), at: '/books/2');

      expect(find.textContaining('pages'), findsNothing);
    });

    testWidgets('a missing book says so and offers no retry', (tester) async {
      await pumpApp(tester, api: _api(), at: '/books/999');

      expect(find.text('That book is not in this library.'), findsOneWidget);
      // A 404 will 404 again.
      expect(find.text('Try again'), findsNothing);
    });
  });

  group('the primary button keeps its three labels', () {
    testWidgets('unstarted offers to start', (tester) async {
      await pumpApp(tester, api: _api(), at: '/books/2');
      expect(find.text('Start Reading'), findsOneWidget);
    });

    testWidgets('partway offers to continue', (tester) async {
      await pumpApp(tester, api: _api(), at: '/books/1');
      expect(find.text('Continue Reading'), findsOneWidget);
    });

    testWidgets('finished offers to read again', (tester) async {
      await pumpApp(tester, api: _api(), at: '/books/3');
      expect(find.text('Read Again'), findsOneWidget);
    });
  });

  group('immediate writes', () {
    testWidgets('rating commits on click, with no Save', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/books/1');

      // The fifth star of the rating row. The status line has none here — the
      // detail screen shows stars only in this control.
      await tester.tap(find.byIcon(Icons.star_border).last);
      await pumpUntilSessionKnown(tester);

      expect(api.calls, contains('setState'));
      final after = api.books.firstWhere((b) => b.id == 1);
      expect(after.rating, 5);
      // The endpoint is a PUT for rating and progress together, so a rating
      // click must carry progress along or it erases it.
      expect(after.progress, _dune.progress);
    });

    testWidgets('clicking the current rating clears it', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/books/1');

      // Dune is rated 3; tapping the third star again means "actually, no".
      await tester.tap(find.byIcon(Icons.star).at(2));
      await pumpUntilSessionKnown(tester);

      expect(api.books.firstWhere((b) => b.id == 1).rating, 0);
    });

    testWidgets('moving to a shelf commits immediately', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/books/1');

      await tester.tap(find.text('Move to Shelf'));
      await tester.pump();
      await tester.tap(_inDropdown('To Read'));
      await pumpUntilSessionKnown(tester);

      expect(api.books.firstWhere((b) => b.id == 1).shelfId, 5);
    });

    testWidgets('Remove from shelf appears only when shelved', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/books/1');
      await tester.tap(find.text('Move to Shelf'));
      await tester.pump();
      expect(find.text('Remove from shelf'), findsNothing);

      await tester.tap(_inDropdown('To Read'));
      await pumpUntilSessionKnown(tester);
      await tester.tap(find.text('Move to Shelf'));
      await tester.pump();
      expect(find.text('Remove from shelf'), findsOneWidget);
    });

    testWidgets('removing from a shelf clears it rather than omitting it', (
      tester,
    ) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/books/4');

      await tester.tap(find.text('Move to Shelf'));
      await tester.pump();
      await tester.tap(find.text('Remove from shelf'));
      await pumpUntilSessionKnown(tester);

      // An omitted key means "leave it alone"; only an explicit clear takes
      // the book off the shelf.
      expect(api.books.firstWhere((b) => b.id == 4).shelfId, isNull);
    });
  });

  group('the catalog waits for Save', () {
    testWidgets('a reader is offered no Edit Book at all', (tester) async {
      // PATCH /books/{id} is admin-only, so offering the button would open a
      // form whose Save is guaranteed to 403.
      await pumpApp(tester, api: _api(), at: '/books/1');

      expect(find.text('Edit Book'), findsNothing);
    });

    testWidgets('an admin gets it', (tester) async {
      await pumpApp(
        tester,
        api: _api(user: _admin),
        at: '/books/1',
      );

      expect(find.text('Edit Book'), findsOneWidget);
    });

    testWidgets('typing writes nothing until Save', (tester) async {
      final api = _api(user: _admin);
      await pumpApp(tester, api: api, at: '/books/1');

      await tester.tap(find.text('Edit Book'));
      await tester.pump();
      await tester.enterText(find.byType(TextField).first, 'Dune Messiah');
      await tester.pump();

      expect(api.calls, isNot(contains('updateBook')));
      expect(api.books.firstWhere((b) => b.id == 1).title, 'Dune');
    });

    testWidgets('Save commits', (tester) async {
      final api = _api(user: _admin);
      await pumpApp(tester, api: api, at: '/books/1');

      await tester.tap(find.text('Edit Book'));
      await tester.pump();
      await tester.enterText(find.byType(TextField).first, 'Dune Messiah');
      await tester.tap(find.text('Save'));
      await pumpUntilSessionKnown(tester);

      expect(api.books.firstWhere((b) => b.id == 1).title, 'Dune Messiah');
    });

    testWidgets('Cancel discards', (tester) async {
      final api = _api(user: _admin);
      await pumpApp(tester, api: api, at: '/books/1');

      await tester.tap(find.text('Edit Book'));
      await tester.pump();
      await tester.enterText(find.byType(TextField).first, 'Nonsense');
      await tester.tap(find.text('Cancel'));
      await pumpUntilSessionKnown(tester);

      expect(api.calls, isNot(contains('updateBook')));
      expect(api.books.firstWhere((b) => b.id == 1).title, 'Dune');
    });
  });

  group('Send to Kindle', () {
    testWidgets('without an address it is disabled and says why', (
      tester,
    ) async {
      await pumpApp(tester, api: _api(), at: '/books/1');

      final button = tester.widget<OutlinedButton>(
        find.ancestor(
          of: find.text('Send to Kindle'),
          matching: find.byType(OutlinedButton),
        ),
      );
      expect(button.onPressed, isNull);
      expect(find.textContaining('Add a Kindle address in'), findsOneWidget);
      expect(find.text('your account'), findsOneWidget);
    });

    testWidgets('with an address it sends and confirms', (tester) async {
      final api = _api(user: _withKindle);
      await pumpApp(tester, api: api, at: '/books/1');

      await tester.tap(find.text('Send to Kindle'));
      await pumpUntilSessionKnown(tester);

      expect(api.calls, contains('sendToKindle'));
      expect(find.text('Sent'), findsOneWidget);
    });

    testWidgets('the confirmation settles back to idle', (tester) async {
      final api = _api(user: _withKindle);
      await pumpApp(tester, api: api, at: '/books/1');
      await tester.tap(find.text('Send to Kindle'));
      await pumpUntilSessionKnown(tester);
      expect(find.text('Sent'), findsOneWidget);

      await tester.pump(_pastConfirmation);
      await tester.pump();

      // "Sent" is a confirmation, not a resting state — leaving it there makes
      // the next send look done already.
      expect(find.text('Sent'), findsNothing);
      expect(find.text('Send to Kindle'), findsOneWidget);
    });

    testWidgets('a failure shows the reason from the API', (tester) async {
      final api = _api(user: _withKindle)
        ..kindleFailure = const BadRequest(
          'The mail server refused the message',
          statusCode: 502,
        );
      await pumpApp(tester, api: api, at: '/books/1');

      await tester.tap(find.text('Send to Kindle'));
      await pumpUntilSessionKnown(tester);

      expect(
        find.text("Couldn't send — The mail server refused the message"),
        findsOneWidget,
      );
      // Back to idle: the button is usable again.
      expect(find.text('Send to Kindle'), findsOneWidget);
    });

    testWidgets('last sent answers "did I already send this?"', (tester) async {
      final api = _api(user: _withKindle);
      await pumpApp(tester, api: api, at: '/books/1');

      await tester.tap(find.text('Send to Kindle'));
      await pumpUntilSessionKnown(tester);
      await tester.pump(_pastConfirmation);
      await tester.pump();

      expect(find.textContaining('Last sent'), findsOneWidget);
    });
  });

  group('download', () {
    testWidgets('asks the server for the file', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/books/1');

      await tester.tap(find.text('Download'));
      await pumpUntilSessionKnown(tester);

      expect(api.calls, contains('downloadBook'));
    });
  });

  group('notes', () {
    testWidgets('starts empty and adds one', (tester) async {
      final api = _api();
      await pumpApp(tester, api: api, at: '/books/1');
      expect(find.text('No notes yet.'), findsOneWidget);

      await tester.enterText(
        find.byType(TextField).last,
        'The spice must flow',
      );
      await tester.tap(find.text('Add'));
      await pumpUntilSessionKnown(tester);

      expect(find.text('The spice must flow'), findsOneWidget);
      expect(find.text('No notes yet.'), findsNothing);
    });

    testWidgets('deletes one', (tester) async {
      final api = _api();
      await api.createNote(1, text: 'Temporary thought');
      await pumpApp(tester, api: api, at: '/books/1');
      expect(find.text('Temporary thought'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.delete_outline));
      await pumpUntilSessionKnown(tester);

      expect(find.text('Temporary thought'), findsNothing);
    });
  });
}

/// The sidebar lists the same shelf names, so a bare text finder is ambiguous.
/// Scoping to the dropdown is also the more honest assertion: it is the menu's
/// row that is under test, not any label that happens to match.
Finder _inDropdown(String label) =>
    find.descendant(of: find.byType(DropdownRow), matching: find.text(label));

/// Just past the moment the confirmation is due to clear.
///
/// Read from the token rather than transcribed: a local copy is a second
/// source of truth for one number, and it drifted — it said 2600ms against a
/// token of 2500ms, so retuning the token would have left this test pumping an
/// interval with no particular relationship to the behaviour it asserts.
final _pastConfirmation =
    LibraDurations.transientConfirmation + const Duration(milliseconds: 100);
