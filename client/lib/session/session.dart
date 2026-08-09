/// The signed-in reader, and the seam milestone 3 replaces.
///
/// The scaffold needs the account row to render — it is the new sidebar
/// furniture this milestone exists to build — but authentication itself is
/// #25. So the shape of the session is settled here and the source of it is
/// not: [sessionProvider] resolves to `null`, the account row treats that as
/// "still loading" and shows a skeleton, and #25 overrides this one provider
/// with the real `GET /auth/me` read without touching a widget.
///
/// That is also how tests get a signed-in reader: override this provider, not
/// an HTTP client.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

class SessionUser {
  const SessionUser({
    required this.id,
    required this.username,
    required this.isAdmin,
    this.kindleEmail,
  });

  final int id;
  final String username;

  /// Gates Manage Users in the account dropdown, and the whole of #31.
  final bool isAdmin;

  /// Null until the reader sets one. Send to Kindle has a distinct no-address
  /// state precisely because this is nullable.
  final String? kindleEmail;

  /// The avatar's single character. Uppercased here rather than at each call
  /// site so an empty username cannot produce a `RangeError` in a widget.
  String get initial => username.isEmpty ? '?' : username[0].toUpperCase();
}

/// Overridden in #25 by the real session read, and in tests by a literal.
final sessionProvider = Provider<SessionUser?>((ref) => null);
