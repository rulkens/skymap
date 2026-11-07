/**
 * ANTIQUE_LABEL_STYLE — the antique look's label sizes and offset, in the label
 * clamp's px (`Label2D.minPixelSize`/`maxPixelSize`, em height). The subject of
 * the view gets the one largest name on the plate at a fixed size; every other
 * name is capped below it, so no class label outranks the subject. A lifted
 * name's ink sits `rimFraction` of its subject's apparent diameter plus `gapPx`
 * above the subject's centre (`liftedLabelPlacement`'s `inkGapPx`): past 0.5,
 * the bare rim, so Saturn's rings stand clear of its name at the tilts we show.
 */

export const ANTIQUE_LABEL_STYLE = {
  subjectPx: 34,
  maxPx: 24,
  rimFraction: 0.65,
  gapPx: 6,
} as const;
