/// The interactive row shared by the sidebar nav, the account row, and every
/// later list row (shelves, tags, dropdown items).
///
/// It exists because of the handoff's own gap list: nav rows, shelf rows, tag
/// rows and dropdown items were all `<div onClick>` — unfocusable, not
/// keyboard-activatable, invisible to a screen reader. That is a defect to fix
/// rather than a style to match, so every row in this client goes through here
/// and gets focus, keyboard activation and a semantic label for free.
///
/// [FocusableActionDetector] rather than [InkWell] because the theme turns
/// Material's ripple off, and what is left of `InkWell` is hover and focus
/// tracking that this does explicitly — including the design's own focus ring,
/// which Material has no slot for.
library;

import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// The focus ring is 2px at 2px offset, so it always reserves 4px around the
/// row whether or not it is drawn. Reserving it unconditionally keeps focus
/// from nudging the layout.
const _ringWidth = 2.0;
const _ringOffset = 2.0;

class LibraTappableRow extends StatefulWidget {
  const LibraTappableRow({
    required this.child,
    required this.onTap,
    this.semanticLabel,
    this.selected = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    this.radius = LibraRadius.standard,
    super.key,
  });

  final Widget child;
  final VoidCallback onTap;

  /// Needed for icon-only controls; ordinary rows are labelled by their text.
  final String? semanticLabel;

  /// Active nav row: `accentLight` fill, which outranks the hover tint.
  final bool selected;

  final EdgeInsetsGeometry padding;
  final double radius;

  @override
  State<LibraTappableRow> createState() => _LibraTappableRowState();
}

class _LibraTappableRowState extends State<LibraTappableRow> {
  bool _hovered = false;
  bool _focused = false;

  Color get _background {
    if (widget.selected) return LibraColors.accentLight;
    if (_hovered) return LibraColors.accentLighter;
    return const Color(0x00000000);
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: widget.selected,
      label: widget.semanticLabel,
      child: FocusableActionDetector(
        mouseCursor: SystemMouseCursors.click,
        onShowHoverHighlight: (v) => setState(() => _hovered = v),
        onShowFocusHighlight: (v) => setState(() => _focused = v),
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              widget.onTap();
              return null;
            },
          ),
        },
        child: GestureDetector(
          onTap: widget.onTap,
          behavior: HitTestBehavior.opaque,
          child: Container(
            padding: const EdgeInsets.all(_ringOffset),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(
                widget.radius + _ringOffset + _ringWidth,
              ),
              border: Border.all(
                color: _focused ? LibraColors.accent : const Color(0x00000000),
                width: _ringWidth,
              ),
            ),
            child: AnimatedContainer(
              duration: LibraDurations.rowHover,
              padding: widget.padding,
              decoration: BoxDecoration(
                color: _background,
                borderRadius: BorderRadius.circular(widget.radius),
              ),
              child: widget.child,
            ),
          ),
        ),
      ),
    );
  }
}
