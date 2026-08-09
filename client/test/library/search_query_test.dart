/// The tokeniser, tested directly rather than through a text field — the edge
/// cases are all in the string handling.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/library/search_query.dart';

void main() {
  group('parseSearch', () {
    test('plain words are free text', () {
      final parsed = parseSearch('dune messiah ');
      expect(parsed.freeText, 'dune messiah');
      expect(parsed.tagTokens, isEmpty);
      expect(parsed.trailingToken, isNull);
    });

    test('separates #tags from words', () {
      final parsed = parseSearch('dune #scifi #classics ');
      expect(parsed.freeText, 'dune');
      expect(parsed.tagTokens, ['scifi', 'classics']);
    });

    test('a tag mid-string is still a tag', () {
      final parsed = parseSearch('#scifi dune ');
      expect(parsed.freeText, 'dune');
      expect(parsed.tagTokens, ['scifi']);
    });

    test('the trailing token is held back while it is being typed', () {
      // "#sci" on the way to "#scifi" must not filter to nothing.
      final parsed = parseSearch('dune #sci');
      expect(parsed.freeText, 'dune');
      expect(parsed.tagTokens, isEmpty);
      expect(parsed.trailingToken, 'sci');
    });

    test('a space completes the token', () {
      final parsed = parseSearch('dune #sci ');
      expect(parsed.tagTokens, ['sci']);
      expect(parsed.trailingToken, isNull);
    });

    test('a bare # is someone about to type, not a tag named empty', () {
      expect(parseSearch('#').trailingToken, '');
      expect(parseSearch('# ').tagTokens, isEmpty);
      expect(parseSearch('# ').freeText, isEmpty);
    });

    test('collapses runs of whitespace', () {
      final parsed = parseSearch('  dune    messiah  ');
      expect(parsed.freeText, 'dune messiah');
    });

    test('empty input is empty, not a token', () {
      final parsed = parseSearch('');
      expect(parsed.freeText, isEmpty);
      expect(parsed.tagTokens, isEmpty);
      expect(parsed.trailingToken, isNull);
    });
  });

  group('removeTagToken', () {
    test('removes just that token', () {
      expect(removeTagToken('dune #scifi more ', 'scifi'), 'dune more ');
    });

    test('matches case-insensitively, as tag lookup does', () {
      expect(removeTagToken('#SciFi dune ', 'scifi'), 'dune ');
    });

    test('leaves other tags alone', () {
      expect(removeTagToken('#scifi #classics ', 'scifi'), '#classics ');
    });

    test('does not add a trailing space where there was none', () {
      expect(removeTagToken('dune #scifi', 'scifi'), 'dune');
    });
  });
}
