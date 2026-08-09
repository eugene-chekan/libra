/// The theme's job is to carry the tokens into Material's slots. These tests
/// pin the mappings that widgets rely on without naming a token themselves —
/// if `buildLibraTheme` stops driving a slot from `LibraColors`, a widget that
/// reads `Theme.of(context)` silently reverts to Material's default and nothing
/// else would catch it.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:libra_client/theme/theme.dart';
import 'package:libra_client/theme/tokens.dart';
import 'package:libra_client/theme/typography.dart';

void main() {
  final theme = buildLibraTheme();

  test('colour scheme is driven by the tokens', () {
    expect(theme.colorScheme.primary, LibraColors.accent);
    expect(theme.colorScheme.surface, LibraColors.card);
    expect(theme.colorScheme.onSurface, LibraColors.text);
    expect(theme.colorScheme.outline, LibraColors.border);
    expect(theme.colorScheme.error, LibraColors.danger);
  });

  test('ripples are off', () {
    // The single most recognisably-Material thing on screen, and the design has
    // no vocabulary for it.
    expect(theme.splashFactory, NoSplash.splashFactory);
    expect(theme.highlightColor, Colors.transparent);
  });

  test('density is tightened for a dense desktop layout', () {
    expect(theme.visualDensity, VisualDensity.compact);
    expect(theme.materialTapTargetSize, MaterialTapTargetSize.shrinkWrap);
  });

  test('the text theme carries the named roles', () {
    // Compared field by field rather than whole-style: ThemeData runs the text
    // theme through `.apply()`, which adds a debug label and an explicit
    // `TextDecoration.none`. What matters is that `fontFamily: sans` on the
    // ThemeData does not flatten the serif roles — it would be a quiet way to
    // lose every page title.
    final pageTitle = theme.textTheme.headlineLarge!;
    expect(pageTitle.fontFamily, LibraFonts.serif);
    expect(pageTitle.fontSize, LibraText.pageTitle.fontSize);

    final body = theme.textTheme.bodyMedium!;
    expect(body.fontFamily, LibraFonts.sans);
    expect(body.fontSize, LibraText.body.fontSize);

    final sectionLabel = theme.textTheme.labelSmall!;
    expect(sectionLabel.fontWeight, FontWeight.w700);
    expect(sectionLabel.letterSpacing, LibraText.sectionLabel.letterSpacing);
  });

  test('the primary button keeps its own hover shade', () {
    // `accentHover` is an independent token; the prototype overwrote it with
    // the flat accent value and lost the hover state entirely.
    final background = theme.filledButtonTheme.style!.backgroundColor!;
    expect(background.resolve({WidgetState.hovered}), LibraColors.accentHover);
    expect(background.resolve({}), LibraColors.accent);
    expect(background.resolve({WidgetState.disabled}), LibraColors.border);
  });
}
