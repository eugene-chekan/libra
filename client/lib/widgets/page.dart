/// The content pane: 28px/36px padding, page title, then the screen's body.
///
/// Every screen inside the shell uses this, so the title's type and the pane's
/// padding are stated once. The book detail screen is the exception — its title
/// is the book's, at a larger serif cut, and it supplies its own header.
library;

import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import '../theme/typography.dart';

class LibraPage extends StatelessWidget {
  const LibraPage({
    required this.title,
    required this.child,
    this.trailing,
    super.key,
  });

  final String title;

  /// Sits opposite the title: the search field on the library, Manage Tags on
  /// the shelves page.
  final Widget? trailing;

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(
        vertical: LibraSpace.contentPaneVertical,
        horizontal: LibraSpace.contentPaneHorizontal,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(child: Text(title, style: LibraText.pageTitle)),
              ?trailing,
            ],
          ),
          const SizedBox(height: 24),
          Expanded(child: child),
        ],
      ),
    );
  }
}
