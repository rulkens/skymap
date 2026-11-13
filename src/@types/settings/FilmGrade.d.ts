/**
 * FilmGrade — the film look's per-pixel grade, read by the compositor's FILM
 * variant. Pixel knobs are CSS-independent: device px at the frame's corner.
 */
export type FilmGrade = {
  contrast: number;
  lift: number;
  splitTone: number;
  grain: number;
  grainSizePx: number;
  vignette: number;
  chromaticPx: number;
  softnessPx: number;
  /** Anamorphic ratio 1..2; also stretches the bloom taps. */
  squeeze: number;
};
