/**
 * How far a title's ink (and its outline) keeps above its subject's centre, in print
 * units (`ANTIQUE_REFERENCE_HEIGHT_CSS`): the largest star glyph's ray (`glyphs.wesl`,
 * Sirius's 8 units swelled by its 8% hand jitter), the caption halo's knock-out
 * (`captionHalo.wesl` `REACH`), and a unit of air. Closer, the halo erases the rays.
 */
export const ANTIQUE_TITLE_CLEAR_UNITS = 8 * 1.08 + 3 + 1;
