import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/theme/tokens.dart';
import 'package:libra_client/widgets/skeleton.dart';

import '../helpers.dart';

void main() {
  group('LibraDeferred', () {
    testWidgets('renders nothing until the delay has passed', (tester) async {
      await pumpLibra(tester, const LibraDeferred(child: Text('loading')));

      // The whole point: on localhost most requests resolve inside this window
      // and a skeleton that flashes for 40ms reads as a glitch.
      expect(find.text('loading'), findsNothing);

      await tester.pump(
        LibraDurations.skeletonDelay - const Duration(milliseconds: 1),
      );
      expect(find.text('loading'), findsNothing);

      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('loading'), findsOneWidget);
    });

    testWidgets('honours an explicit delay', (tester) async {
      await pumpLibra(
        tester,
        const LibraDeferred(
          delay: Duration(milliseconds: 500),
          child: Text('loading'),
        ),
      );

      await tester.pump(LibraDurations.skeletonDelay);
      expect(find.text('loading'), findsNothing);

      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('loading'), findsOneWidget);
    });

    testWidgets('cancels its timer when disposed before firing', (
      tester,
    ) async {
      await pumpLibra(tester, const LibraDeferred(child: Text('loading')));

      // Navigating away inside the delay window must not leave a timer running
      // against a dead State. The clock is deliberately *not* advanced past the
      // deadline afterwards: an uncancelled timer is then still pending when
      // the test ends, which flutter_test fails on. Advancing time first would
      // let it fire and complete, and the test would pass either way.
      await pumpLibra(tester, const SizedBox.shrink());

      expect(find.text('loading'), findsNothing);
    });
  });

  group('LibraCoverGridSkeleton', () {
    testWidgets('renders the requested number of cells', (tester) async {
      useDesignViewport(tester);
      await pumpLibra(
        tester,
        const SingleChildScrollView(child: LibraCoverGridSkeleton(count: 4)),
      );
      await tester.pump();

      // Three blocks per cell: the cover, then the title and author lines.
      expect(find.byType(LibraSkeletonBlock), findsNWidgets(4 * 3));
    });
  });
}
