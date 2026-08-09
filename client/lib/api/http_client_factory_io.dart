import 'package:http/http.dart' as http;

/// The VM/desktop client. Cookies are not a browser concern here, so there is
/// nothing to opt into; this exists so tests and a future desktop build can
/// load the library at all.
http.Client createHttpClient() => http.Client();
