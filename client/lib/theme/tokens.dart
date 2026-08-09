/// The design tokens from `docs/specs/client-design.md`, transcribed.
///
/// That document is the source of truth; this file is its Dart form. Nothing
/// here should be invented, and no colour, radius or duration should appear
/// anywhere else in the client — a literal `Color(0xFF...)` in a widget is a
/// token that escaped, and the next person to need it will pick a slightly
/// different one.
library;

import 'package:flutter/widgets.dart';

abstract final class LibraColors {
  /// Sidebar background, input fills, inset panels.
  static const bg = Color(0xFFF7F5F2);

  /// Main content pane, modal surfaces.
  static const card = Color(0xFFFFFFFF);

  /// All 1px borders, dividers, the empty progress track.
  static const border = Color(0xFFE8E4DF);

  /// Primary text, headings.
  static const text = Color(0xFF2A2520);

  /// Secondary text, labels, inactive nav.
  static const textMid = Color(0xFF6B6259);

  /// Tertiary text, metadata, placeholders, icons.
  static const textLight = Color(0xFFA39A8E);

  /// Primary actions, active states, progress fill, stars.
  static const accent = Color(0xFF8B5E3C);

  /// Primary button hover. Deliberately an independent token, never derived
  /// from [accent] — the prototype overwrote it with the flat accent value and
  /// lost the hover shade entirely.
  static const accentHover = Color(0xFF7A5030);

  /// Active nav background, tag pill background.
  static const accentLight = Color(0xFFF0E8DF);

  /// Row hover background, inline edit field background.
  static const accentLighter = Color(0xFFF8F3ED);

  /// Cover placeholder fallback.
  static const coverBg = Color(0xFFE8E4DF);

  /// Destructive icon hover, error accents.
  static const danger = Color(0xFFCC4444);

  /// Selection highlight: accent at 20% alpha.
  static const selection = Color(0x338B5E3C);
}

abstract final class LibraFonts {
  /// Logo, page titles, book titles on covers, shelf names, modal headings.
  /// Weight 400 only — there is no other cut.
  static const serif = 'Instrument Serif';

  /// Everything else.
  static const sans = 'DM Sans';
}

abstract final class LibraSpace {
  static const contentPaneVertical = 28.0;
  static const contentPaneHorizontal = 36.0;
  static const sidebarVertical = 28.0;
  static const sidebarHorizontal = 16.0;
  static const sidebarWidth = 240.0;
  static const libraryGridGap = 28.0;
  static const shelfRowGap = 20.0;

  /// Prose column cap for the reader. Not from the handoff — it had no reader
  /// — but 60-75 characters is the measure prose wants, and the library grid's
  /// habit of filling its pane is wrong here.
  static const readerColumnMax = 680.0;
}

abstract final class LibraRadius {
  static const standard = 8.0;
  static const modal = 12.0;
  static const cover = 4.0;
  static const pill = 20.0;
}

abstract final class LibraShadows {
  static const coverRest = [
    BoxShadow(color: Color(0x1F000000), offset: Offset(2, 4), blurRadius: 12),
    BoxShadow(color: Color(0x14000000), offset: Offset(0, 1), blurRadius: 3),
  ];
  static const coverHover = [
    BoxShadow(color: Color(0x2E000000), offset: Offset(3, 8), blurRadius: 20),
  ];
  static const modal = [
    BoxShadow(color: Color(0x33000000), offset: Offset(0, 24), blurRadius: 80),
  ];
  static const dropdown = [
    BoxShadow(color: Color(0x1F000000), offset: Offset(0, 8), blurRadius: 24),
  ];
}

abstract final class LibraDurations {
  /// Default for interactive elements: colour, border, background.
  static const interactive = Duration(milliseconds: 150);
  static const rowHover = Duration(milliseconds: 120);
  static const coverLift = Duration(milliseconds: 200);
  static const progressBar = Duration(milliseconds: 300);
  static const chevron = Duration(milliseconds: 200);
  static const modalEnter = Duration(milliseconds: 250);
  static const dropdownEnter = Duration(milliseconds: 150);

  /// Skeletons appear only after this delay. On localhost most requests
  /// resolve faster, and a skeleton that flashes for 40ms reads as a glitch.
  static const skeletonDelay = Duration(milliseconds: 200);

  /// One shared pulse, so nothing in the app breathes at its own rate.
  static const skeletonPulse = Duration(milliseconds: 1400);

  /// How long "Sent" holds before the button returns to idle.
  static const transientConfirmation = Duration(milliseconds: 2500);
}

abstract final class LibraLayout {
  /// The width the design was drawn for.
  static const designWidth = 1280.0;

  /// Degrades acceptably to here — the book detail action row splitting into
  /// two rows is what makes this width work. Below it the layout is undefined,
  /// and the handoff's desktop-only stance stands.
  static const minSupportedWidth = 1024.0;

  /// Covers are ~1.45 tall relative to their width (160x232, 96x140, 200x292).
  static const coverAspect = 1 / 1.45;

  /// The grid is `auto-fill minmax(160px, 1fr)`.
  static const libraryCellMin = 160.0;
}
