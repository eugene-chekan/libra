import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

/// `withCredentials` is what sends the `libra_session` cookie cross-origin.
///
/// Only needed when the client is served from somewhere other than the API. In
/// the packaged single-origin run it is harmless; in the split dev setup it is
/// essential, and it only works when the server names that exact origin in
/// `LIBRA_CORS_ORIGINS` — the CORS spec forbids credentialed requests against a
/// `*` origin, and the browser rejects the response rather than warning.
http.Client createHttpClient() => BrowserClient()..withCredentials = true;

/// The origin the page itself was loaded from.
///
/// This is what makes the app work from any device on the network without
/// being rebuilt. The API address cannot be baked in at compile time and still
/// be right for everyone: a phone opening `http://192.168.1.10:8000` would
/// otherwise call `localhost`, meaning *its own* device. Reading it from
/// `Uri.base` means the answer is always "wherever this page came from".
String defaultApiBaseUrl() => Uri.base.origin;
