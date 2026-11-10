/**
 * YoungStarsLanes — §5's shader-side shaping of the YOUNG STARS chain tier's
 * stars-map read (`hiiSplat/youngFragment.wesl`'s `g3.w` branch, mirrored in
 * `extrasFragment.wesl`'s young branch), packed to the field
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
  /**
   * `render.hiiNearFadeStart` — boundRadius multiple where a component the
   * eye is approaching starts fading (`hiiSplat/vertex.wesl`'s vs and
   * `hiiSplat/shadeCommon.wesl`'s fs, `hiiNearFade`). Optional, not
   * grouped with `contrastGamma`/`invMeanNorm` above: it rides `render`, not
   * `fieldTuning`, so `buildFieldHeaderInputs.ts` fills it in at the HII
   * header call site rather than this row's other two lanes' own getter.
   * Absent (or <= `nearFadeEnd`) packs 0, which the shader guard reads as
   * "no fade."
   */
  readonly nearFadeStart?: number;
  /** `render.hiiNearFadeEnd` — boundRadius multiple where the component has fully collapsed. See `nearFadeStart`. */
  readonly nearFadeEnd?: number;
};
