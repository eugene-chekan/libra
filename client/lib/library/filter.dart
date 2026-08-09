/// What the library is currently filtered to, and how it is spelled in a URL.
///
/// The filter lives in the address bar rather than in a provider's private
/// state, so a filtered view is linkable, survives a reload, and comes back
/// with the browser's back button. That is the same reason the routes are real
/// routes: "send someone the shelf I'm looking at" should work.
///
/// **The client does not filter anything.** It merges the sidebar selection and
/// any typed `#tag` tokens into one list of ids and sends it; the server ANDs
/// the query and the shelf against the OR of the tags. Re-implementing that
/// here would give two answers to the same question.
library;

/// Where the library lives. `/` redirects here.
const libraryRoute = '/library';

const shelfParam = 'shelf';
const tagsParam = 'tags';
const queryParam = 'q';

class LibraryFilter {
  const LibraryFilter({this.query = '', this.tagIds = const [], this.shelfId});

  /// Bare words. ANDs against the tag result, matching title or author.
  final String query;

  /// Tags OR each other. The union of sidebar clicks and `#tag` tokens, in the
  /// order they were added, deduplicated.
  final List<int> tagIds;

  /// ANDs. At most one — a book sits on one shelf.
  final int? shelfId;

  bool get isEmpty => query.trim().isEmpty && tagIds.isEmpty && shelfId == null;

  /// True when the reader is looking for something specific, which is what
  /// distinguishes "no books match your search" from "your library is empty".
  bool get isSearching => !isEmpty;

  LibraryFilter copyWith({
    String? query,
    List<int>? tagIds,
    int? shelfId,
    bool clearShelf = false,
  }) => LibraryFilter(
    query: query ?? this.query,
    tagIds: tagIds ?? this.tagIds,
    shelfId: clearShelf ? null : shelfId ?? this.shelfId,
  );

  /// Adds or removes a tag, so one click toggles it whether it came from the
  /// sidebar or the summary pill.
  LibraryFilter toggleTag(int id) => copyWith(
    tagIds: tagIds.contains(id)
        ? [...tagIds.where((t) => t != id)]
        : [...tagIds, id],
  );

  /// Reads the filter out of a route's query parameters.
  ///
  /// Unparseable ids are dropped rather than throwing: these values come from
  /// the address bar, where anyone can type anything, and a malformed link
  /// should degrade to a broader view rather than to an error screen.
  factory LibraryFilter.fromQueryParameters(Map<String, String> params) {
    final rawTags = params[tagsParam] ?? '';
    final ids = <int>[];
    for (final part in rawTags.split(',')) {
      final id = int.tryParse(part.trim());
      if (id != null && !ids.contains(id)) ids.add(id);
    }
    return LibraryFilter(
      query: params[queryParam] ?? '',
      tagIds: ids,
      shelfId: int.tryParse(params[shelfParam] ?? ''),
    );
  }

  /// The route this filter corresponds to. Empty values are omitted so an
  /// unfiltered library is plain `/library` rather than a line of empty
  /// parameters.
  String toLocation() {
    final params = <String, String>{
      if (query.trim().isNotEmpty) queryParam: query.trim(),
      if (tagIds.isNotEmpty) tagsParam: tagIds.join(','),
      if (shelfId != null) shelfParam: '$shelfId',
    };
    return params.isEmpty
        ? libraryRoute
        : Uri(path: libraryRoute, queryParameters: params).toString();
  }

  @override
  bool operator ==(Object other) =>
      other is LibraryFilter &&
      other.query == query &&
      other.shelfId == shelfId &&
      other.tagIds.length == tagIds.length &&
      other.tagIds.every(tagIds.contains);

  @override
  int get hashCode =>
      Object.hash(query, shelfId, Object.hashAllUnordered(tagIds));
}
