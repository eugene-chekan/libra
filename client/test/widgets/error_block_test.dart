import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/widgets/error_block.dart';

import '../helpers.dart';

void main() {
  testWidgets('shows the message', (tester) async {
    await pumpLibra(
      tester,
      const LibraErrorBlock(message: 'Could not reach the library.'),
    );

    expect(find.text('Could not reach the library.'), findsOneWidget);
  });

  testWidgets('offers no retry when one would be meaningless', (tester) async {
    // A 404 or a validation failure needs the reader to change something; a
    // "Try again" that will fail identically is worse than no button.
    await pumpLibra(tester, const LibraErrorBlock(message: 'No such book.'));

    expect(find.text('Try again'), findsNothing);
  });

  testWidgets('retries when asked', (tester) async {
    var retries = 0;
    await pumpLibra(
      tester,
      LibraErrorBlock(message: 'Upload failed.', onRetry: () => retries++),
    );

    await tester.tap(find.text('Try again'));
    expect(retries, 1);
  });

  testWidgets('takes a custom retry label', (tester) async {
    await pumpLibra(
      tester,
      LibraErrorBlock(
        message: 'Delivery failed.',
        onRetry: () {},
        retryLabel: 'Send again',
      ),
    );

    expect(find.text('Send again'), findsOneWidget);
    expect(find.text('Try again'), findsNothing);
  });
}
