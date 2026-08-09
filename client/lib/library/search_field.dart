/// The library's search field, and the `#tag` autocomplete hanging off it.
///
/// Typing is debounced before it reaches the URL: every keystroke pushing a
/// route would fill the browser's history with half-typed words and make the
/// back button useless.
///
/// A `#tag` token is resolved to a real tag and lifted out of the text into a
/// pill, rather than left as text the reader has to keep intact. That way the
/// field only ever holds free text, the applied filter is visible in one place,
/// and removing a tag is the same gesture whether it came from here or the
/// sidebar.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../theme/tokens.dart';
import '../theme/typography.dart';
import 'search_query.dart';

/// How long typing settles before the filter is pushed to the route.
const searchDebounce = Duration(milliseconds: 300);

class LibrarySearchField extends StatefulWidget {
  const LibrarySearchField({
    required this.query,
    required this.tags,
    required this.onQueryChanged,
    required this.onTagAdded,
    super.key,
  });

  /// The free-text part of the current filter, which the field is seeded from.
  final String query;

  /// Every tag this reader can filter by, for the autocomplete to match on.
  final List<Tag> tags;

  final ValueChanged<String> onQueryChanged;
  final ValueChanged<Tag> onTagAdded;

  @override
  State<LibrarySearchField> createState() => _LibrarySearchFieldState();
}

class _LibrarySearchFieldState extends State<LibrarySearchField> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.query,
  );
  final _focus = FocusNode();
  Timer? _debounce;
  List<Tag> _suggestions = const [];

  @override
  void didUpdateWidget(LibrarySearchField old) {
    super.didUpdateWidget(old);
    // The filter can change from elsewhere — a sidebar click, the back button.
    // Only overwrite the field when it genuinely disagrees, so typing is never
    // interrupted mid-word.
    final parsed = parseSearch(_controller.text);
    if (widget.query != old.query && widget.query != parsed.freeText) {
      _controller.text = widget.query;
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String raw) {
    final parsed = parseSearch(raw);

    // A complete token that names a real tag becomes a pill immediately — the
    // reader typed a space, which is them saying "that word is finished".
    for (final token in parsed.tagTokens) {
      final tag = _findExact(token);
      if (tag != null) {
        _controller.text = removeTagToken(raw, token);
        _controller.selection = TextSelection.collapsed(
          offset: _controller.text.length,
        );
        setState(() => _suggestions = const []);
        widget.onTagAdded(tag);
        return;
      }
    }

    setState(() {
      _suggestions = parsed.trailingToken == null
          ? const []
          : _matching(parsed.trailingToken!);
    });

    _debounce?.cancel();
    _debounce = Timer(searchDebounce, () {
      if (mounted) {
        widget.onQueryChanged(parseSearch(_controller.text).freeText);
      }
    });
  }

  Tag? _findExact(String token) {
    for (final tag in widget.tags) {
      if (tag.name.toLowerCase() == token.toLowerCase()) return tag;
    }
    return null;
  }

  List<Tag> _matching(String prefix) {
    if (prefix.isEmpty) return widget.tags.take(8).toList();
    final lower = prefix.toLowerCase();
    return widget.tags
        .where((t) => t.name.toLowerCase().contains(lower))
        .take(8)
        .toList();
  }

  void _accept(Tag tag) {
    final parsed = parseSearch(_controller.text);
    final token = parsed.trailingToken;
    if (token != null) {
      // The trailing token is not in `tagTokens`, so strip it by hand.
      final text = _controller.text;
      final cut = text.lastIndexOf('#$token');
      _controller.text = cut < 0 ? text : text.substring(0, cut);
    }
    _controller.selection = TextSelection.collapsed(
      offset: _controller.text.length,
    );
    setState(() => _suggestions = const []);
    widget.onTagAdded(tag);
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 320,
          height: 38,
          child: TextField(
            controller: _controller,
            focusNode: _focus,
            onChanged: _onChanged,
            onSubmitted: (_) {
              final suggestions = _suggestions;
              if (suggestions.isNotEmpty) {
                _accept(suggestions.first);
              } else {
                _debounce?.cancel();
                widget.onQueryChanged(parseSearch(_controller.text).freeText);
              }
            },
            style: LibraText.body,
            decoration: const InputDecoration(
              hintText: 'Search, or #tag',
              prefixIcon: Icon(
                Icons.search,
                size: 16,
                color: LibraColors.textLight,
              ),
              prefixIconConstraints: BoxConstraints(minWidth: 34),
            ),
          ),
        ),
        if (_suggestions.isNotEmpty)
          _SuggestionList(suggestions: _suggestions, onAccept: _accept),
      ],
    );
  }
}

/// Rendered inline under the field rather than in an overlay: the field sits in
/// the page header with the whole content pane beneath it, so there is nothing
/// for a floating panel to avoid, and an inline list stays in the tab order
/// without any focus juggling.
class _SuggestionList extends StatelessWidget {
  const _SuggestionList({required this.suggestions, required this.onAccept});

  final List<Tag> suggestions;
  final ValueChanged<Tag> onAccept;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 320,
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: LibraColors.card,
        borderRadius: BorderRadius.circular(LibraRadius.standard),
        border: Border.all(color: LibraColors.border),
        boxShadow: LibraShadows.dropdown,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final tag in suggestions)
            _SuggestionRow(tag: tag, onTap: () => onAccept(tag)),
        ],
      ),
    );
  }
}

class _SuggestionRow extends StatefulWidget {
  const _SuggestionRow({required this.tag, required this.onTap});

  final Tag tag;
  final VoidCallback onTap;

  @override
  State<_SuggestionRow> createState() => _SuggestionRowState();
}

class _SuggestionRowState extends State<_SuggestionRow> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        child: GestureDetector(
          onTap: widget.onTap,
          behavior: HitTestBehavior.opaque,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: _hovered
                  ? LibraColors.accentLighter
                  : const Color(0x00000000),
              borderRadius: BorderRadius.circular(LibraRadius.cover),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '#${widget.tag.name}',
                    style: LibraText.listRow,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Text('${widget.tag.bookCount}', style: LibraText.metadataSmall),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
