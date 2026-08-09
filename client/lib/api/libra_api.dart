/// The API surface, as an interface.
///
/// An interface rather than a concrete class with a swappable inner `Client`
/// because the fake then has to satisfy *this* — a Dart type — instead of
/// impersonating HTTP. Tests get a real object with real behaviour and no
/// socket, and `flutter test` never needs a backend running.
///
/// It carries only what milestone 3 needs. Books, shelves, tags and notes
/// arrive with the milestones that render them; a client method with no caller
/// is a guess about a screen that has not been built.
library;

import 'models.dart';

abstract interface class LibraApi {
  /// `POST /auth/login`. Throws [Unauthorized] on bad credentials — which the
  /// login screen renders as one non-specific message, never as "no such user".
  ///
  /// Returns the signed-in reader. The session cookie is set by the browser
  /// from the response's `Set-Cookie`; nothing here ever sees the token, which
  /// is the point of it being `httponly`.
  Future<CurrentUser> login({
    required String username,
    required String password,
  });

  /// `POST /auth/logout`. Revokes the session server-side, not just in the
  /// browser — clearing the cookie alone would leave a token that still works
  /// for anyone who captured it.
  Future<void> logout();

  /// `GET /auth/me`. Throws [Unauthorized] when there is no live session,
  /// which is how a cold load discovers whether the reader is signed in.
  Future<CurrentUser> currentUser();

  /// `PATCH /users/{id}`. Used by milestone 3 only for the Kindle address;
  /// #31 reuses it for the admin's per-row commits.
  Future<CurrentUser> updateUser(int id, {String? kindleEmail});
}
