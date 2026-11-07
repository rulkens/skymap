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
  titleMaxChars: 14,
  capitals: { px: 20, trackingEm: 0.35 },
  roman: { px: 16, trackingEm: 0.08 },
  italic: { px: 17, trackingEm: 0 },
  // A land or sea on a globe, either cut: under the planets' capitals.
  areaPx: 16,
  rimFraction: 0.65,
  gapPx: 6,
} as const;
