/// Shared test setup.
///
/// The design targets ≥1280px and is undefined below 1024px, so the default
/// 800x600 test surface is narrower than any viewport this client supports —
/// widgets would overflow and fail for a reason the app will never hit. Every
/// widget test that renders the shell sizes the surface to the design width
/// first.
///
/// Everything is driven through [FakeLibraApi] rather than by overriding the
/// session directly. That is the point of the seam: the tests exercise the real
/// [SessionController], including its cold-load probe and its expiry rule,
/// against an API that behaves like the server. No test needs a backend, and
/// none of them can accidentally assert on a session state the controller could
/// never actually produce.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/api/fake_libra_api.dart';
import 'package:libra_client/api/models.dart';
import 'package:libra_client/api/providers.dart';
import 'package:libra_client/app.dart';
import 'package:libra_client/router.dart';
import 'package:libra_client/theme/theme.dart';

const testReader = CurrentUser(
  id: 1,
  username: 'eugene',
  isAdmin: false,
  kindleSender: 'libra@example.com',
);

const testAdmin = CurrentUser(
  id: 2,
  username: 'ada',
  isAdmin: true,
  kindleSender: 'libra@example.com',
);

/// Sizes the test surface to the width the design was drawn for, and restores
/// it afterwards.
void useDesignViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(1280, 900);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

/// A container wired to [api], for testing the session without any widgets.
ProviderContainer apiContainer(FakeLibraApi api) {
  final container = ProviderContainer(
    overrides: [apiProvider.overrideWithValue(api)],
  );
  addTearDown(container.dispose);
  return container;
}

/// Pumps [child] with the real theme, over [api].
///
/// Does **not** settle by default. Several of these widgets animate forever —
/// the skeleton pulse — and one exists precisely to do nothing for its first
/// 200ms, so a blanket `pumpAndSettle` would either hang or skip the behaviour
/// under test. Callers that need the session resolved use
/// [pumpUntilSessionKnown].
Future<void> pumpLibra(
  WidgetTester tester,
  Widget child, {
  FakeLibraApi? api,
  bool settle = false,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiProvider.overrideWithValue(api ?? FakeLibraApi(signedIn: true)),
      ],
      child: MaterialApp(
        theme: buildLibraTheme(),
        home: Scaffold(body: child),
      ),
    ),
  );
  if (settle) await tester.pumpAndSettle();
}

/// Pumps the whole app — router, guards and all — over [api], opening at [at].
Future<void> pumpApp(
  WidgetTester tester, {
  required FakeLibraApi api,
  String at = '/',
}) async {
  useDesignViewport(tester);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        apiProvider.overrideWithValue(api),
        initialLocationProvider.overrideWithValue(at),
      ],
      child: const LibraApp(),
    ),
  );
  await pumpUntilSessionKnown(tester);
}

/// Waits for the session's `GET /auth/me` to land without waiting for the
/// animations `pumpAndSettle` insists on — the account row's skeleton pulses
/// forever, so settling is not always available.
Future<void> pumpUntilSessionKnown(WidgetTester tester) async {
  for (var i = 0; i < 30; i++) {
    await tester.pump(const Duration(milliseconds: 16));
  }
}
