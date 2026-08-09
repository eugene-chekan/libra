/// The type scale from `docs/specs/client-design.md`, one constant per role.
///
/// Named after what each style is *for* rather than how big it is, because
/// "page title" survives a redesign and "serif30" does not.
library;

import 'package:flutter/widgets.dart';

import 'tokens.dart';

abstract final class LibraText {
  static const logo = TextStyle(
    fontFamily: LibraFonts.serif,
    fontSize: 28,
    letterSpacing: -0.5,
    color: LibraColors.text,
  );

  static const pageTitle = TextStyle(
    fontFamily: LibraFonts.serif,
    fontSize: 30,
    letterSpacing: -0.5,
    color: LibraColors.text,
  );

  static const detailTitle = TextStyle(
    fontFamily: LibraFonts.serif,
    fontSize: 34,
    letterSpacing: -0.5,
    height: 1.15,
    color: LibraColors.text,
  );

  static const modalHeading = TextStyle(
    fontFamily: LibraFonts.serif,
    fontSize: 22,
    color: LibraColors.text,
  );

  static const shelfName = TextStyle(
    fontFamily: LibraFonts.serif,
    fontSize: 22,
    color: LibraColors.text,
  );

  static const body = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: LibraColors.text,
  );

  static const buttonLabel = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 14,
    fontWeight: FontWeight.w600,
  );

  static const cardTitle = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 13,
    fontWeight: FontWeight.w600,
    height: 1.3,
    color: LibraColors.text,
  );

  static const fieldLabel = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 12,
    fontWeight: FontWeight.w600,
    color: LibraColors.textMid,
  );

  /// 11px 700 uppercase with wide tracking. Used for "SHARED WITH YOU",
  /// "READING PROGRESS", "LIBRARIAN" and the stub badge.
  static const sectionLabel = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 1.2,
    color: LibraColors.textLight,
  );

  static const metadata = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: LibraColors.textLight,
  );

  static const metadataSmall = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 11,
    fontWeight: FontWeight.w400,
    color: LibraColors.textLight,
  );

  /// Sidebar nav and list rows.
  static const navRow = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: LibraColors.textMid,
  );

  static const navRowActive = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: LibraColors.accent,
  );

  /// Sidebar shelf and tag rows, dropdown items, manage-modal rows.
  static const listRow = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: LibraColors.textMid,
  );

  /// Reading prose. Line height is generous because the reader is the one
  /// screen where the text is the whole interface.
  static const readerBody = TextStyle(
    fontFamily: LibraFonts.sans,
    fontSize: 16,
    fontWeight: FontWeight.w400,
    height: 1.65,
    color: LibraColors.text,
  );
}
