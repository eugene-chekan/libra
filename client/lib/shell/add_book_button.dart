/// The sidebar's Add Book button.
///
/// Dashed, deliberately. `client-design.md` contrasts it with the *solid*
/// accent button on the empty first-run library — "here alone it is a solid
/// accent button rather than the sidebar's dashed one" — so the dashed border
/// is what marks this as the always-available affordance rather than the one
/// thing to do on the screen. Flutter has no dashed [Border], hence the
/// painter.
library;

import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import '../theme/typography.dart';

class AddBookButton extends StatefulWidget {
  const AddBookButton({required this.onPressed, super.key});

  final VoidCallback onPressed;

  @override
  State<AddBookButton> createState() => _AddBookButtonState();
}

class _AddBookButtonState extends State<AddBookButton> {
  bool _hovered = false;
  bool _focused = false;

  @override
  Widget build(BuildContext context) {
    final active = _hovered || _focused;
    final color = active ? LibraColors.accent : LibraColors.textMid;

    return Semantics(
      button: true,
      child: FocusableActionDetector(
        mouseCursor: SystemMouseCursors.click,
        onShowHoverHighlight: (v) => setState(() => _hovered = v),
        onShowFocusHighlight: (v) => setState(() => _focused = v),
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) {
              widget.onPressed();
              return null;
            },
          ),
        },
        child: GestureDetector(
          onTap: widget.onPressed,
          behavior: HitTestBehavior.opaque,
          child: CustomPaint(
            painter: _DashedBorderPainter(
              color: active ? LibraColors.accent : LibraColors.border,
              radius: LibraRadius.standard,
            ),
            child: AnimatedContainer(
              duration: LibraDurations.interactive,
              padding: const EdgeInsets.symmetric(vertical: 11),
              decoration: BoxDecoration(
                color: active
                    ? LibraColors.accentLighter
                    : const Color(0x00000000),
                borderRadius: BorderRadius.circular(LibraRadius.standard),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add, size: 16, color: color),
                  const SizedBox(width: 8),
                  Text(
                    'Add Book',
                    style: LibraText.buttonLabel.copyWith(
                      fontSize: 13,
                      color: color,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Walks the rounded rect's path and paints alternating on/off runs.
///
/// [PathMetric.extractPath] is the only way to dash an arbitrary path in
/// Flutter; doing it per corner by hand would not survive a radius change.
class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter({required this.color, required this.radius});

  final Color color;
  final double radius;

  static const _dash = 4.0;
  static const _gap = 3.0;
  static const _stroke = 1.5;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = _stroke;

    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Offset.zero & size,
          Radius.circular(radius),
        ).deflate(_stroke / 2),
      );

    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        canvas.drawPath(metric.extractPath(distance, distance + _dash), paint);
        distance += _dash + _gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorderPainter old) =>
      old.color != color || old.radius != radius;
}
