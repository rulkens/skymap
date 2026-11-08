/**
 * ANTIQUE_LABEL_STYLE — the antique look's cuts of type (`AntiqueLettering`), each
 * at one fixed em size in the label clamp's px, as an engraver set a class of name
 * in one size of type. The subject of the view gets the plate's one largest name;
 * a subject name longer than `titleMaxChars` is set in italic, not capitals, so it
 * stays a title without spanning the plate. A lifted name's ink sits `rimFraction`
 * of its subject's apparent diameter plus `gapPx` above the subject's centre
 * (`liftedLabelPlacement`'s `inkGapPx`): past 0.5, the bare rim, so Saturn's rings
 * stand clear of its name at the tilts we show.
 */

export const ANTIQUE_LABEL_STYLE = {
  romanFont: 'imFell',
  italicFont: 'imFellItalic',
  subjectPx: 30,
  // A selected name grows to the subject's size, and shrinks back when let go, over this.
  titleGrowMs: 220,
  titleMaxChars: 14,
  // `advanceEm`: IM Fell's mean glyph advance in the cut over a sample of place names
  // (tracking excluded), so a producer can size a name's box before the atlas sets it.
  capitals: { px: 23, trackingEm: 0.35, advanceEm: 0.68 },
  roman: { px: 19, trackingEm: 0.08, advanceEm: 0.47 },
  italic: { px: 21, trackingEm: 0, advanceEm: 0.41 },
  spacedItalic: { px: 19, trackingEm: 0.3, advanceEm: 0.65 },
  // A land or sea on a globe, either cut: under the planets' capitals.
  areaPx: 16,
  rimFraction: 0.65,
  gapPx: 6,
} as const;
