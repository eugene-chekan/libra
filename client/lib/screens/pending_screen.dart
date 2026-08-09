/// The stand-in every screen this milestone does not build yet.
///
/// The scaffold's job is the frame — router, shell, sidebar, primitives — and
/// each screen arrives with its own milestone. Naming the issue on screen keeps
/// the scaffold honest about what is and is not built, rather than leaving a
/// blank pane that reads as a bug.
library;

import 'package:flutter/material.dart';

import '../widgets/empty_state.dart';
import '../widgets/page.dart';

class PendingScreen extends StatelessWidget {
  const PendingScreen({required this.title, required this.issue, super.key});

  final String title;

  /// The GitHub issue that replaces this screen, e.g. `#26`.
  final String issue;

  @override
  Widget build(BuildContext context) {
    return LibraPage(
      title: title,
      child: LibraEmptyState(
        title: 'Not built yet',
        message: '$title arrives with $issue.',
      ),
    );
  }
}
