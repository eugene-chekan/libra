/// What the API layer throws, and nothing else.
///
/// Widgets never see an `http` type: the client translates status codes into
/// these once, so no screen has to remember what a 401 means. [Unauthorized] in
/// particular is the one the session controller listens for — it is the only
/// error in the app that can arrive without the reader doing anything.
library;

sealed class ApiException implements Exception {
  const ApiException(this.message);

  final String message;

  @override
  String toString() => '$runtimeType: $message';
}

/// A 401. Handled centrally by the session, never per screen.
class Unauthorized extends ApiException {
  const Unauthorized([super.message = 'Not authenticated']);
}

/// A 403 — signed in, but not allowed. Distinct from [Unauthorized] because
/// signing in again would not help, so it must not trigger the expiry redirect.
class Forbidden extends ApiException {
  const Forbidden([super.message = 'Admin privileges required']);
}

class NotFound extends ApiException {
  const NotFound([super.message = 'Not found']);
}

/// A 4xx the caller can fix by changing what they sent — a duplicate username,
/// a malformed Kindle address. Carries the server's `detail` so the form can
/// show it.
class BadRequest extends ApiException {
  const BadRequest(super.message, {this.statusCode = 400});

  final int statusCode;
}

/// A 5xx, or a response that was not JSON when it should have been.
class ServerError extends ApiException {
  const ServerError([super.message = 'The server failed to handle that.']);
}

/// The request never got an answer: the backend is down, the address is wrong,
/// or — the one worth calling out — CORS rejected it. A browser reports a
/// blocked preflight as a generic network failure with no detail, so this is
/// what a misconfigured `LIBRA_CORS_ORIGINS` looks like from in here.
class NetworkFailure extends ApiException {
  const NetworkFailure([super.message = 'Could not reach the library server.']);
}
