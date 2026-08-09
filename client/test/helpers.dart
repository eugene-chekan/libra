/// Shared test setup.
///
/// The design targets ≥1280px and is undefined below 1024px, so the default
/// 800x600 test surface is narrower than any viewport this client supports —
/// widgets would overflow and fail for a reason the app will never hit. Every
/// widget test that renders the shell sizes the surface to the design width
/// first.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/session/session.dart';
import 'package:libra_client/theme/theme.dart';

/// Sizes the test surface to the width the design was drawn for, and restores
/// it afterwards.
void useDesignViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(1280, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

/// Pumps [child] with the real theme and a provider scope, which is the
/// smallest thing most of these widgets need to build.
///
/// [user] is taken rather than a list of overrides because `flutter_riverpod`
/// does not export the `Override` type — it is public only from
/// `package:riverpod/misc.dart`, which is a transitive dependency this client
/// should not import. The session is the only thing the scaffold overrides
/// anyway; a milestone that needs more can widen this then.
Future<void> pumpLibra(WidgetTester tester, Widget child, {SessionUser? user}) {
  return tester.pumpWidget(
    ProviderScope(
      overrides: [sessionProvider.overrideWithValue(user)],
      child: MaterialApp(
        theme: buildLibraTheme(),
        home: Scaffold(body: child),
      ),
    ),
  );
}
