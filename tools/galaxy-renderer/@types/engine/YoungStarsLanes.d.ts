/**
 * YoungStarsLanes — §5's shader-side shaping of the YOUNG STARS chain tier's
 * stars-map read (`splat.wesl`'s `g3.w` branch), packed to the field
 * header's `youngStars` row (`io.wesl`). Only the HII header carries real
 * values — the field draw's own components never carry a nonzero
 * `starsWeight`, same asymmetry `HiiTextureLanes` documents for its own scale/
 * contrast pair.
 */
export type YoungStarsLanes = {
  /** `tuning.hii.youngStars.contrast` — the gamma shaping the stars-map read. */
  readonly contrastGamma: number;
  /** `1 / (texel-area-weighted mean of pow(stars, contrastGamma))` — renormalises the shaped read back to mean 1 so the contrast knob restructures without draining the tier's calibrated flux. */
  readonly invMeanNorm: number;
};
