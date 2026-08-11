/// The seam. One override swaps the whole API for the fake.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'http_client_factory.dart';
import 'http_libra_api.dart';
import 'libra_api.dart';

/// An explicit override for where the backend lives, empty by default.
///
/// Only needed when the client is *not* served by the API — the split dev
/// setup, or a build pointed at some other host:
///
/// ```
/// flutter run -d chrome --dart-define=LIBRA_API_BASE_URL=http://192.168.1.10:8000
/// ```
const apiBaseUrlOverride = String.fromEnvironment('LIBRA_API_BASE_URL');

/// Where the backend lives.
///
/// Defaults to the origin the page came from rather than a compile-time
/// constant, because the address that is correct depends on the device asking.
/// Baking one in means the build only works from the machine it was built for;
/// reading it from the page means a phone, a laptop and the server itself all
/// get the right answer from the same artifact.
String get apiBaseUrl =>
    apiBaseUrlOverride.isNotEmpty ? apiBaseUrlOverride : defaultApiBaseUrl();

/// Overridden with a `FakeLibraApi` in every widget test, and in any future
/// demo build. Nothing else in the app constructs an API client.
final apiProvider = Provider<LibraApi>((ref) {
  final api = HttpLibraApi(baseUrl: apiBaseUrl, client: createHttpClient());
  ref.onDispose(api.close);
  return api;
});
