/// Splitting what the reader typed into the two things the server takes.
///
/// One field carries both because that is what the design draws, and because
/// "dune #scifi" is how people actually search — a subject and a qualifier in
/// one breath. Bare words become `q`, which ANDs against title and author;
/// `#tag` tokens become ids, which OR each other.
///
/// Kept pure and separate from the widget so the rules can be tested directly
/// rather than through a text field. The tokenising is the part with edge cases
/// — a bare `#`, a token mid-string, a trailing space — and those are easier to
/// get wrong than to test.
library;

class ParsedSearch {
  const ParsedSearch({
    required this.freeText,
    required this.tagTokens,
    this.trailingToken,
  });

  /// Everything that was not a `#tag`, joined by single spaces. Sent as `q`.
  final String freeText;

  /// Complete `#tag` tokens, without the `#`, in the order typed.
  final List<String> tagTokens;

  /// The token still being typed — the trailing `#...` when the input does not
  /// end in whitespace. This is what the autocomplete offers against, and it is
  /// deliberately *not* in [tagTokens]: "#sci" should not filter to nothing on
  /// the way to "#scifi".
  final String? trailingToken;
}

ParsedSearch parseSearch(String raw) {
  final endsOpen = raw.isNotEmpty && !raw.endsWith(' ');
  final parts = raw.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();

  String? trailing;
  if (endsOpen && parts.isNotEmpty && parts.last.startsWith('#')) {
    trailing = parts.removeLast().substring(1);
  }

  final tags = <String>[];
  final words = <String>[];
  for (final part in parts) {
    if (part.startsWith('#')) {
      final name = part.substring(1);
      // A bare `#` is someone about to type a tag, not a tag named "".
      if (name.isNotEmpty) tags.add(name);
    } else {
      words.add(part);
    }
  }

  return ParsedSearch(
    freeText: words.join(' '),
    tagTokens: tags,
    trailingToken: trailing,
  );
}

/// Removes one `#token` from the raw text, leaving the rest untouched.
///
/// Used when a token is resolved to a real tag and becomes a pill: the text
/// should lose exactly that word and keep whatever else was typed, including
/// the reader's spacing elsewhere.
String removeTagToken(String raw, String token) {
  final parts = raw.split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
  final kept = parts.where(
    (p) =>
        !(p.startsWith('#') &&
            p.substring(1).toLowerCase() == token.toLowerCase()),
  );
  final joined = kept.join(' ');
  // Keep the trailing space if there was one, so the caret does not jump back
  // against the previous word.
  return raw.endsWith(' ') && joined.isNotEmpty ? '$joined ' : joined;
}
