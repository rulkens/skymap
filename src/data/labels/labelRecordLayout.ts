/**
 * One label record, `struct LabelRecord` in `labels/io.wesl` (`labelRecord.parity` holds them
 * equal): word offsets into a record of `LABEL_RECORD_WORDS` 4-byte words.
 *
 *   0–2  atHi, 4–6 atLo  f32  the position, absolute Mpc, as an f32 hi/lo pair (`writeHiLoVertex`)
 *   3    radiusMpc       f32  the subject's radius (0 = none)
 *   7    alpha           f32  the only word written per frame
 *   8    pick            u32  packed pick word (`packPickWord`); 0 = not clickable
 *   9    style           u32  index into `LABEL_STYLE_IDS`
 *   10   tint            u32  rgba8 (`packRgba8Unorm`); 0 = the style's colour
 *   11   glyphs          u32  first glyph instance; 12 glyphCount
 *   13   rank            f32  priority × CAPTION_PRIORITY_SCALE; declutter adds apparent size
 *   14   revealNear, 15 revealFar  f32  the reveal band's fullAt and goneAt, Mpc (0, ∞ = none)
 */
export const LABEL_RECORD = {
  atHi: 0,
  radiusMpc: 3,
  atLo: 4,
  alpha: 7,
  pick: 8,
  style: 9,
  tint: 10,
  glyphs: 11,
  glyphCount: 12,
  rank: 13,
  revealNear: 14,
  revealFar: 15,
} as const;

export const LABEL_RECORD_WORDS = 16;
