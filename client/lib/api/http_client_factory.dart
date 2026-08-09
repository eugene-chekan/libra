/// Picks the HTTP client the current platform needs.
///
/// On web the session cookie is only attached when the request opts in —
/// `fetch`'s `credentials: 'include'`, which `BrowserClient` exposes as
/// `withCredentials`. Without it the browser silently sends no cookie and every
/// authenticated request 401s, which looks exactly like a broken login.
///
/// The conditional export is required, not stylistic: `package:http/browser_client.dart`
/// does not compile on the VM, so `flutter test` could not even load this
/// library if it were imported unconditionally.
library;

export 'http_client_factory_io.dart'
    if (dart.library.js_interop) 'http_client_factory_web.dart';
