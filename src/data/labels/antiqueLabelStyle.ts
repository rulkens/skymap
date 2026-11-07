/**
 * ANTIQUE_LABEL_STYLE — the antique look's lettering, sizes in the label clamp's
 * px (`Label2D.minPixelSize`/`maxPixelSize`, em height). The subject of the view
 * gets the one largest name on the plate at a fixed size; capitals are capped
 * below it and the star italics smaller still, as an engraver set them.
 * `trackingEm` letter-spaces the capitals. A lifted name's ink sits `rimFraction`
 * of its subject's apparent diameter plus `gapPx` above the subject's centre
 * (`liftedLabelPlacement`'s `inkGapPx`): past 0.5, the bare rim, so Saturn's
 * rings stand clear of its name at the tilts we show.
 */

export const ANTIQUE_LABEL_STYLE = {
  romanFont: 'imFell',
  italicFont: 'imFellItalic',
  subjectPx: 30,
  capitalsPx: 20,
  italicPx: 15,
  trackingEm: 0.35,
  rimFraction: 0.65,
  gapPx: 6,
} as const;
