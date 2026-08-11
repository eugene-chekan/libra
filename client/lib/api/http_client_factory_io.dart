import 'package:http/http.dart' as http;

/// The VM/desktop client. Cookies are not a browser concern here, so there is
/// nothing to opt into; this exists so tests and a future desktop build can
/// load the library at all.
http.Client createHttpClient() => http.Client();

/// Off the web there is no page to take an origin from, so this is the
/// conventional local backend. A desktop build (Phase 5) will need this to
/// become a real setting rather than a default.
String defaultApiBaseUrl() => 'http://localhost:8000';
