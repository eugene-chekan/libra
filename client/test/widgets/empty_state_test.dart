import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/widgets/empty_state.dart';

import '../helpers.dart';

void main() {
  testWidgets('renders the first-run library shape', (tester) async {
    useDesignViewport(tester);
    await pumpLibra(
      tester,
      LibraEmptyState(
        title: 'Your library is empty',
        message: 'Add an EPUB to get started.',
        action: FilledButton(onPressed: () {}, child: const Text('Add Book')),
      ),
    );

    expect(find.text('Your library is empty'), findsOneWidget);
    expect(find.text('Add an EPUB to get started.'), findsOneWidget);
    expect(find.text('Add Book'), findsOneWidget);
  });

  testWidgets('stays one line when that is all there is', (tester) async {
    // The search empty state is a single line and stays that way.
    await pumpLibra(
      tester,
      const LibraEmptyState(title: 'No books match your search.'),
    );

    expect(find.text('No books match your search.'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
  });
}
