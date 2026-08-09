/// Typed shapes for what the API returns.
///
/// Every `fromJson` reads the keys it knows and **ignores everything else**.
/// That is deliberate: the backend's `BookRead` grows a field when format
/// conversion lands, and a strict decoder would turn that additive change into
/// a breaking one for every client older than the deploy.
///
/// Nullability mirrors the backend exactly. `kindleEmail` is null until the
/// reader sets one, which is why Send to Kindle has a distinct no-address
/// state rather than a disabled button with no explanation.
library;

/// The signed-in reader — `GET /auth/me`'s `CurrentUserRead`.
class CurrentUser {
  const CurrentUser({
    required this.id,
    required this.username,
    required this.isAdmin,
    this.kindleEmail,
    this.kindleSender,
  });

  factory CurrentUser.fromJson(Map<String, dynamic> json) => CurrentUser(
    id: json['id'] as int,
    username: json['username'] as String,
    isAdmin: json['is_admin'] as bool? ?? false,
    kindleEmail: json['kindle_email'] as String?,
    kindleSender: json['kindle_sender'] as String?,
  );

  final int id;
  final String username;

  /// Gates Manage Users in the account dropdown, and the whole of #31.
  final bool isAdmin;

  /// Where this reader's books are sent. Null until they set one.
  final String? kindleEmail;

  /// The instance's *sender* address, which the reader must add to their Amazon
  /// approved-document list. Server config rather than a property of the user,
  /// which is why it rides on `/auth/me` and not on `/users`. Not a secret —
  /// it is precisely the string they have to copy.
  final String? kindleSender;

  /// The avatar's single character. Uppercased here rather than at each call
  /// site so an empty username cannot produce a `RangeError` in a widget.
  String get initial => username.isEmpty ? '?' : username[0].toUpperCase();

  CurrentUser copyWith({String? kindleEmail, bool clearKindleEmail = false}) =>
      CurrentUser(
        id: id,
        username: username,
        isAdmin: isAdmin,
        kindleEmail: clearKindleEmail ? null : kindleEmail ?? this.kindleEmail,
        kindleSender: kindleSender,
      );
}
