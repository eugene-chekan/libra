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

import 'dart:typed_data';

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

/// A book as this reader sees it — `BookRead`.
///
/// The catalog fields and the reader's own state arrive flattened rather than
/// nested, because a card treats rating and progress as properties of the book
/// on screen. The defaults *are* the answer when no state row exists, which is
/// the common case: rows are created lazily on first interaction.
class Book {
  const Book({
    required this.id,
    required this.title,
    required this.author,
    required this.format,
    this.hasCover = false,
    this.shelfId,
    this.tagIds = const [],
    this.rating = 0,
    this.progress = 0,
    this.year,
    this.pages,
    this.blurb,
    this.startedAt,
    this.finishedAt,
    this.lastSentAt,
  });

  factory Book.fromJson(Map<String, dynamic> json) => Book(
    id: json['id'] as int,
    title: json['title'] as String? ?? '',
    author: json['author'] as String? ?? '',
    format: json['format'] as String? ?? '',
    hasCover: json['has_cover'] as bool? ?? false,
    shelfId: json['shelf_id'] as int?,
    tagIds: [...?(json['tag_ids'] as List?)?.map((e) => e as int)],
    rating: json['rating'] as int? ?? 0,
    progress: (json['progress'] as num?)?.toDouble() ?? 0,
    year: json['year'] as int?,
    pages: json['pages'] as int?,
    blurb: json['blurb'] as String?,
    startedAt: _parseDate(json['started_at']),
    finishedAt: _parseDate(json['finished_at']),
    lastSentAt: _parseDate(json['last_sent_at']),
  );

  final int id;
  final String title;
  final String author;
  final String format;

  /// Sent by the list endpoint so a grid does not fire one cover request per
  /// book that 404s on first paint. False means "draw the gradient", which
  /// needs no round trip to decide on.
  final bool hasCover;

  final int? shelfId;

  /// Global tags plus this reader's own — never another reader's.
  final List<int> tagIds;

  final int rating;

  /// 0..1.
  final double progress;

  final int? year;
  final int? pages;
  final String? blurb;
  final DateTime? startedAt;
  final DateTime? finishedAt;
  final DateTime? lastSentAt;

  /// The card's status line picks one of three, in this order.
  bool get isInProgress => progress > 0 && progress < 1;
  bool get isFinished => progress >= 1 || finishedAt != null;
  bool get isUnstarted => !isInProgress && !isFinished;

  /// [clearShelf] is separate from a null [shelfId] for the same reason the
  /// endpoint distinguishes them: omitting the shelf means "leave it alone",
  /// while clearing it means "take this off the shelf".
  Book copyWith({
    String? title,
    String? author,
    int? year,
    int? pages,
    String? blurb,
    int? rating,
    double? progress,
    int? shelfId,
    bool clearShelf = false,
    List<int>? tagIds,
    DateTime? lastSentAt,
  }) => Book(
    id: id,
    title: title ?? this.title,
    author: author ?? this.author,
    format: format,
    hasCover: hasCover,
    shelfId: clearShelf ? null : shelfId ?? this.shelfId,
    tagIds: tagIds ?? this.tagIds,
    rating: rating ?? this.rating,
    progress: progress ?? this.progress,
    year: year ?? this.year,
    pages: pages ?? this.pages,
    blurb: blurb ?? this.blurb,
    startedAt: startedAt,
    finishedAt: finishedAt,
    lastSentAt: lastSentAt ?? this.lastSentAt,
  );
}

/// `TagRead`. Global tags are admin-curated and shared; personal ones belong to
/// the caller.
class Tag {
  const Tag({
    required this.id,
    required this.name,
    this.isGlobal = false,
    this.bookCount = 0,
    this.editable = false,
  });

  factory Tag.fromJson(Map<String, dynamic> json) => Tag(
    id: json['id'] as int,
    name: json['name'] as String? ?? '',
    isGlobal: json['is_global'] as bool? ?? false,
    bookCount: json['book_count'] as int? ?? 0,
    editable: json['editable'] as bool? ?? false,
  );

  final int id;
  final String name;
  final bool isGlobal;
  final int bookCount;

  /// Whether this reader may rename or delete it. Server-decided, so the client
  /// never re-derives the rule.
  final bool editable;
}

/// `ShelfRead`.
class Shelf {
  const Shelf({
    required this.id,
    required this.name,
    required this.ownerId,
    this.position = 0,
    this.visibility = 'private',
    this.bookCount = 0,
    this.editable = false,
  });

  factory Shelf.fromJson(Map<String, dynamic> json) => Shelf(
    id: json['id'] as int,
    name: json['name'] as String? ?? '',
    ownerId: json['owner_id'] as int? ?? 0,
    position: json['position'] as int? ?? 0,
    visibility: json['visibility'] as String? ?? 'private',
    bookCount: json['book_count'] as int? ?? 0,
    editable: json['editable'] as bool? ?? false,
  );

  final int id;
  final String name;
  final int ownerId;
  final int position;
  final String visibility;
  final int bookCount;
  final bool editable;

  bool get isPublic => visibility == 'public';
}

/// One of this reader's notes on a book — `NoteRead`.
///
/// There is no `user_id`: every note a caller can read is their own, so the
/// field would only ever restate the session.
class Note {
  const Note({
    required this.id,
    required this.bookId,
    required this.text,
    this.page,
    this.createdAt,
  });

  factory Note.fromJson(Map<String, dynamic> json) => Note(
    id: json['id'] as int,
    bookId: json['book_id'] as int? ?? 0,
    text: json['text'] as String? ?? '',
    page: json['page'] as int?,
    createdAt: _parseDate(json['created_at']),
  );

  final int id;
  final int bookId;
  final String text;
  final int? page;
  final DateTime? createdAt;
}

/// What a send attempt reports back — `KindleDeliveryRead`.
///
/// `attemptedAt`, not `sentAt`. Amazon discards mail from an unapproved sender
/// without a bounce, so handing the message to the mail server is the last
/// observable event; the name should not claim more than that.
class KindleDelivery {
  const KindleDelivery({required this.bookId, this.sentTo, this.attemptedAt});

  factory KindleDelivery.fromJson(Map<String, dynamic> json) => KindleDelivery(
    bookId: json['book_id'] as int? ?? 0,
    sentTo: json['sent_to'] as String?,
    attemptedAt: _parseDate(json['attempted_at']),
  );

  final int bookId;
  final String? sentTo;
  final DateTime? attemptedAt;
}

/// A downloaded file and the name the server gave it.
///
/// The name matters: `file_path` is a generated UUID, so without the server's
/// `Content-Disposition` a reader would find `9f3a…-4c1b.epub` in their
/// downloads folder rather than the book they asked for.
class DownloadedFile {
  const DownloadedFile({required this.bytes, required this.filename});

  final Uint8List bytes;
  final String filename;
}

DateTime? _parseDate(Object? raw) =>
    raw is String ? DateTime.tryParse(raw) : null;
