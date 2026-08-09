/// Loading placeholders.
///
/// Skeletons for content that is arriving; spinners only for actions the reader
/// started, and only inside the control that started them. Settled once here
/// rather than per screen, because per-screen improvisation is how an
/// application ends up with four spinners.
library;

import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// Renders nothing until [LibraDurations.skeletonDelay] has passed, then shows
/// [child].
///
/// A local-first app on localhost usually resolves faster than that, and a
/// skeleton that flashes for 40ms reads as a glitch rather than as feedback.
class LibraDeferred extends StatefulWidget {
  const LibraDeferred({required this.child, this.delay, super.key});

  final Widget child;
  final Duration? delay;

  @override
  State<LibraDeferred> createState() => _LibraDeferredState();
}

class _LibraDeferredState extends State<LibraDeferred> {
  bool _visible = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(widget.delay ?? LibraDurations.skeletonDelay, () {
      if (mounted) setState(() => _visible = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      _visible ? widget.child : const SizedBox.shrink();
}

/// A pulsing placeholder block.
///
/// Each block owns its controller. That is a controller per block rather than
/// per screen; if a skeleton ever gets big enough for that to show up in a
/// frame budget, hoist the animation into an inherited widget rather than
/// making the pulse cheaper.
class LibraSkeletonBlock extends StatefulWidget {
  const LibraSkeletonBlock({
    this.width,
    this.height,
    this.radius = LibraRadius.cover,
    this.aspectRatio,
    super.key,
  });

  final double? width;
  final double? height;
  final double radius;
  final double? aspectRatio;

  @override
  State<LibraSkeletonBlock> createState() => _LibraSkeletonBlockState();
}

class _LibraSkeletonBlockState extends State<LibraSkeletonBlock>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: LibraDurations.skeletonPulse,
  )..repeat(reverse: true);

  late final Animation<double> _opacity = Tween(
    begin: 1.0,
    end: 0.55,
  ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Widget block = FadeTransition(
      opacity: _opacity,
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: LibraColors.coverBg,
          borderRadius: BorderRadius.circular(widget.radius),
        ),
      ),
    );
    if (widget.aspectRatio != null) {
      block = AspectRatio(aspectRatio: widget.aspectRatio!, child: block);
    }
    return block;
  }
}

/// A skeleton stand-in for one line of text, sized to the real line's height.
class LibraSkeletonLine extends StatelessWidget {
  const LibraSkeletonLine({
    this.widthFactor = 1.0,
    this.height = 13,
    super.key,
  });

  final double widthFactor;
  final double height;

  @override
  Widget build(BuildContext context) => FractionallySizedBox(
    alignment: Alignment.centerLeft,
    widthFactor: widthFactor,
    child: LibraSkeletonBlock(height: height),
  );
}

/// The library grid's loading state: cells matching the real cell geometry, so
/// content arriving does not shift the layout.
class LibraCoverGridSkeleton extends StatelessWidget {
  const LibraCoverGridSkeleton({this.count = 12, super.key});

  final int count;

  @override
  Widget build(BuildContext context) => GridView.builder(
    physics: const NeverScrollableScrollPhysics(),
    shrinkWrap: true,
    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
      maxCrossAxisExtent: LibraLayout.libraryCellMin * 1.6,
      crossAxisSpacing: LibraSpace.libraryGridGap,
      mainAxisSpacing: LibraSpace.libraryGridGap,
      childAspectRatio: 0.52,
    ),
    itemCount: count,
    itemBuilder: (_, _) => const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: LibraSkeletonBlock(width: double.infinity)),
        SizedBox(height: 10),
        LibraSkeletonLine(widthFactor: 0.8),
        SizedBox(height: 6),
        LibraSkeletonLine(widthFactor: 0.5, height: 12),
      ],
    ),
  );
}
