/// Material, restyled until it stops looking like Material.
///
/// The choice to build on Material rather than hand-roll widgets is recorded in
/// `docs/specs/client-design.md`: the handoff's own gap list says accessibility
/// is largely absent and must be rebuilt properly — real buttons, focus
/// management, dialog semantics — and hand-rolling means reimplementing focus
/// traversal, keyboard activation and text editing to arrive back where
/// Material starts.
///
/// What that costs is this file: ripples off, density tightened, every colour
/// and radius driven from tokens. The pieces that genuinely fight Material —
/// the cover grid, the shelf plank gradient, the progress bars — were never
/// Material components in the first place.
///
/// **There is deliberately no `ThemeExtension` here**, though the Phase 4 plan
/// said there would be. One was going to hold the tokens Material has no slot
/// for — `accentHover`, `accentLighter`, `coverBg` — but the design is a single
/// fixed palette with no dark mode drawn and theming is not a project goal, so
/// an extension would only re-expose `LibraColors` through a context lookup.
/// Indirection with no second implementation behind it is the same thing as the
/// redundant tag filter deleted in #9. If a second palette is ever designed,
/// this is where it goes.
library;

import 'package:flutter/material.dart';

import 'tokens.dart';
import 'typography.dart';

ThemeData buildLibraTheme() {
  final scheme = const ColorScheme.light(
    primary: LibraColors.accent,
    onPrimary: LibraColors.card,
    primaryContainer: LibraColors.accentLight,
    onPrimaryContainer: LibraColors.accent,
    secondary: LibraColors.accent,
    onSecondary: LibraColors.card,
    surface: LibraColors.card,
    onSurface: LibraColors.text,
    surfaceContainerLowest: LibraColors.card,
    surfaceContainerLow: LibraColors.accentLighter,
    surfaceContainer: LibraColors.bg,
    onSurfaceVariant: LibraColors.textMid,
    outline: LibraColors.border,
    outlineVariant: LibraColors.border,
    error: LibraColors.danger,
    onError: LibraColors.card,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: LibraColors.card,
    fontFamily: LibraFonts.sans,

    // Ripples are the single most recognisably-Material thing on screen and
    // the design has no vocabulary for them. Hover and focus states carry the
    // feedback instead, which is what the handoff actually specified.
    splashFactory: NoSplash.splashFactory,
    highlightColor: Colors.transparent,
    hoverColor: LibraColors.accentLighter,
    focusColor: LibraColors.accentLighter,

    // The design is a dense desktop layout: 36px fields, 7px list rows. The
    // default 48px minimum touch target would inflate every one of them.
    visualDensity: VisualDensity.compact,
    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,

    textSelectionTheme: const TextSelectionThemeData(
      selectionColor: LibraColors.selection,
      cursorColor: LibraColors.accent,
    ),

    dividerTheme: const DividerThemeData(
      color: LibraColors.border,
      thickness: 1,
      space: 1,
    ),

    textTheme: const TextTheme(
      displayLarge: LibraText.detailTitle,
      headlineLarge: LibraText.pageTitle,
      headlineMedium: LibraText.modalHeading,
      titleLarge: LibraText.shelfName,
      titleMedium: LibraText.cardTitle,
      bodyLarge: LibraText.body,
      bodyMedium: LibraText.body,
      bodySmall: LibraText.metadata,
      labelLarge: LibraText.buttonLabel,
      labelMedium: LibraText.fieldLabel,
      labelSmall: LibraText.sectionLabel,
    ),

    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: LibraColors.bg,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      hintStyle: LibraText.body.copyWith(color: LibraColors.textLight),
      border: _fieldBorder(LibraColors.border),
      enabledBorder: _fieldBorder(LibraColors.border),
      focusedBorder: _fieldBorder(LibraColors.accent),
      errorBorder: _fieldBorder(LibraColors.danger),
      focusedErrorBorder: _fieldBorder(LibraColors.danger),
    ),

    // The design's primary button: accent fill, white label, 8px radius, and a
    // disabled state that goes flat `border` with a `textLight` label rather
    // than Material's translucent grey.
    filledButtonTheme: FilledButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) {
            return LibraColors.border;
          }
          if (states.contains(WidgetState.hovered)) {
            return LibraColors.accentHover;
          }
          return LibraColors.accent;
        }),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.disabled)
              ? LibraColors.textLight
              : LibraColors.card,
        ),
        textStyle: const WidgetStatePropertyAll(LibraText.buttonLabel),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 24, vertical: 11),
        ),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(LibraRadius.standard),
          ),
        ),
        elevation: const WidgetStatePropertyAll(0),
      ),
    ),

    // The outlined button: 1.5px border, card fill, textMid label, with border
    // *and* text going accent together on hover.
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: const WidgetStatePropertyAll(LibraColors.card),
        foregroundColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.hovered)
              ? LibraColors.accent
              : LibraColors.textMid,
        ),
        side: WidgetStateProperty.resolveWith(
          (states) => BorderSide(
            color: states.contains(WidgetState.hovered)
                ? LibraColors.accent
                : LibraColors.border,
            width: 1.5,
          ),
        ),
        textStyle: const WidgetStatePropertyAll(LibraText.buttonLabel),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 24, vertical: 11),
        ),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(LibraRadius.standard),
          ),
        ),
      ),
    ),

    textButtonTheme: TextButtonThemeData(
      style: ButtonStyle(
        foregroundColor: const WidgetStatePropertyAll(LibraColors.accent),
        textStyle: const WidgetStatePropertyAll(
          TextStyle(
            fontFamily: LibraFonts.sans,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
        padding: const WidgetStatePropertyAll(
          EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        ),
        overlayColor: const WidgetStatePropertyAll(Colors.transparent),
      ),
    ),

    dialogTheme: DialogThemeData(
      backgroundColor: LibraColors.card,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(LibraRadius.modal),
      ),
      titleTextStyle: LibraText.modalHeading,
      contentTextStyle: LibraText.body.copyWith(height: 1.5),
    ),

    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected)
            ? LibraColors.accent
            : Colors.transparent,
      ),
      checkColor: const WidgetStatePropertyAll(LibraColors.card),
      side: const BorderSide(color: LibraColors.border, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
    ),

    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: LibraColors.accent,
      linearTrackColor: LibraColors.border,
    ),

    scrollbarTheme: ScrollbarThemeData(
      thumbColor: WidgetStatePropertyAll(
        LibraColors.textLight.withValues(alpha: 0.5),
      ),
      thickness: const WidgetStatePropertyAll(8),
      radius: const Radius.circular(4),
    ),

    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: LibraColors.text,
        borderRadius: BorderRadius.circular(LibraRadius.cover),
      ),
      textStyle: LibraText.metadataSmall.copyWith(color: LibraColors.card),
    ),
  );
}

OutlineInputBorder _fieldBorder(Color color) => OutlineInputBorder(
  borderRadius: BorderRadius.circular(LibraRadius.standard),
  borderSide: BorderSide(color: color),
);
