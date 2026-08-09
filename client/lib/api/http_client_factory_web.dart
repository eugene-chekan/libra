import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

/// `withCredentials` is what sends the `libra_session` cookie cross-origin.
///
/// It only works when the server names this exact origin in
/// `LIBRA_CORS_ORIGINS` — the CORS spec forbids credentialed requests against a
/// `*` origin, and the browser rejects the response rather than warning.
http.Client createHttpClient() => BrowserClient()..withCredentials = true;
