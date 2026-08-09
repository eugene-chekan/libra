/// The seam. One override swaps the whole API for the fake.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'http_client_factory.dart';
import 'http_libra_api.dart';
import 'libra_api.dart';

/// Where the backend lives.
///
/// A compile-time define rather than a runtime setting: the client is served
/// as static files, so there is no server-side render to inject config, and a
/// `config.json` fetched at boot would add a round trip before the first paint
/// to answer a question that never changes for a given build.
///
/// ```
/// flutter run -d chrome --dart-define=LIBRA_API_BASE_URL=http://192.168.1.10:8000
/// ```
const apiBaseUrl = String.fromEnvironment(
  'LIBRA_API_BASE_URL',
  defaultValue: 'http://localhost:8000',
);

/// Overridden with a `FakeLibraApi` in every widget test, and in any future
/// demo build. Nothing else in the app constructs an API client.
final apiProvider = Provider<LibraApi>((ref) {
  final api = HttpLibraApi(baseUrl: apiBaseUrl, client: createHttpClient());
  ref.onDispose(api.close);
  return api;
});
