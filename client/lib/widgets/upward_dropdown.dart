/// A panel that opens *upward* from its trigger.
///
/// The account row lives at the bottom of the sidebar, so a menu that opened
/// downward would fall off the viewport. The design specifies `bottom: 100%`
/// with a 6px gap — the same pattern Move to Shelf uses on the book detail
/// screen, which is why this is a primitive rather than a detail of the account
/// row.
///
/// Built on [OverlayPortal] and [CompositedTransformFollower] rather than
/// [MenuAnchor]: Material's menu positions itself below the anchor and only
/// flips up when it would otherwise overflow, so the 6px gap above the trigger
/// is not expressible. Anchoring the panel's *bottom* to the trigger's *top* is
/// exactly the specified geometry, with no dependence on how tall the panel is.
///
/// Dismissal covers all three routes the design asks for: outside pointerdown
/// ([TapRegion]), Escape ([DismissIntent]), and selecting a row (the caller
/// closes via the `close` callback). Focus returns to the trigger on close.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/tokens.dart';

class UpwardDropdown extends StatefulWidget {
  const UpwardDropdown({
    required this.trigger,
    required this.menuBuilder,
    this.minWidth = 200,
    this.gap = 6,
    super.key,
  });

  /// Built with a callback that opens the panel, and the focus node the panel
  /// returns focus to.
  final Widget Function(BuildContext context, VoidCallback open, FocusNode node)
  trigger;

  /// Built with a callback that closes the panel, for rows to call on select.
  final Widget Function(BuildContext context, VoidCallback close) menuBuilder;

  final double minWidth;
  final double gap;

  @override
  State<UpwardDropdown> createState() => _UpwardDropdownState();
}

class _UpwardDropdownState extends State<UpwardDropdown> {
  final _controller = OverlayPortalController();
  final _link = LayerLink();
  final _triggerFocus = FocusNode(debugLabel: 'dropdown trigger');

  @override
  void dispose() {
    _triggerFocus.dispose();
    super.dispose();
  }

  void _open() {
    if (!_controller.isShowing) _controller.show();
  }

  void _close() {
    if (!_controller.isShowing) return;
    _controller.hide();
    // Returning focus to the trigger is what stops a keyboard user being
    // dumped back at the top of the page after closing the menu.
    _triggerFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    return CompositedTransformTarget(
      link: _link,
      child: OverlayPortal(
        controller: _controller,
        overlayChildBuilder: (context) => CompositedTransformFollower(
          link: _link,
          // The panel's bottom-left pinned to the trigger's top-left: "opens
          // upward", independent of the panel's height.
          targetAnchor: Alignment.topLeft,
          followerAnchor: Alignment.bottomLeft,
          offset: Offset(0, -widget.gap),
          child: Align(
            alignment: Alignment.bottomLeft,
            child: TapRegion(
              onTapOutside: (_) => _close(),
              child: Shortcuts(
                shortcuts: const {
                  SingleActivator(LogicalKeyboardKey.escape): DismissIntent(),
                },
                child: Actions(
                  actions: {
                    DismissIntent: CallbackAction<DismissIntent>(
                      onInvoke: (_) {
                        _close();
                        return null;
                      },
                    ),
                  },
                  child: FocusScope(
                    autofocus: true,
                    child: _Panel(
                      minWidth: widget.minWidth,
                      child: widget.menuBuilder(context, _close),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        child: widget.trigger(context, _open, _triggerFocus),
      ),
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.minWidth, required this.child});

  final double minWidth;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    // The follower hands down the whole overlay's constraints, so without
    // both of these the panel spans the viewport: [IntrinsicWidth] sizes it to
    // its widest row, and the [ConstrainedBox] keeps that between the
    // specified minimum and something a long label cannot blow past.
    return ConstrainedBox(
      constraints: BoxConstraints(minWidth: minWidth, maxWidth: 320),
      child: IntrinsicWidth(
        child: Material(
          color: LibraColors.card,
          elevation: 0,
          borderRadius: BorderRadius.circular(LibraRadius.standard),
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: LibraColors.card,
              borderRadius: BorderRadius.circular(LibraRadius.standard),
              border: Border.all(color: LibraColors.border),
              boxShadow: LibraShadows.dropdown,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [child],
            ),
          ),
        ),
      ),
    );
  }
}

/// One row in a dropdown: 8px/12px, 13px, 4px radius, `accentLighter` on hover.
class DropdownRow extends StatefulWidget {
  const DropdownRow({
    required this.label,
    required this.onTap,
    this.icon,
    this.muted = false,
    super.key,
  });

  final String label;
  final VoidCallback onTap;
  final IconData? icon;

  /// Sign Out is `textLight` rather than `text` — it is the row you want to be
  /// sure about before clicking.
  final bool muted;

  @override
  State<DropdownRow> createState() => _DropdownRowState();
}

class _DropdownRowState extends State<DropdownRow> {
  bool _hovered = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.muted ? LibraColors.textLight : LibraColors.text;

    return Semantics(
      button: true,
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
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: _hovered || _focused
                  ? LibraColors.accentLighter
                  : const Color(0x00000000),
              borderRadius: BorderRadius.circular(LibraRadius.cover),
            ),
            child: Row(
              children: [
                if (widget.icon != null) ...[
                  Icon(widget.icon, size: 12, color: color),
                  const SizedBox(width: 8),
                ],
                Text(
                  widget.label,
                  style: TextStyle(
                    fontFamily: LibraFonts.sans,
                    fontSize: 13,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The 1px rule between the menu's actions and Sign Out.
class DropdownDivider extends StatelessWidget {
  const DropdownDivider({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 4, horizontal: 8),
    child: Divider(height: 1),
  );
}
