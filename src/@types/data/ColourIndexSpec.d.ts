/** Description of which colour-pair to use for one source. */
export type ColourIndexSpec = {
  /** Which two five-band slots feed the colour difference. */
  slotA: 'u' | 'g' | 'r' | 'i' | 'z';
  slotB: 'u' | 'g' | 'r' | 'i' | 'z';
  /** Natural range of (magA − magB) across galaxy types for this colour pair. */
  rangeMin: number;
  rangeMax: number;
  /**
   * K-correction coefficient applied per unit redshift, in **normalised
   * ramp-position units**.
   *
   * Empirically tuned rather than derived from the literature value: the
   * literal mag/z values from the K-correction literature (3.0 for u−g
   * etc.) over-correct in the normalised 0..2 ramp space because the
   * normalisation expands the dynamic range (the OLD raw-u−g shader
   * mostly used the t=[0.3, 1.3] middle of the ramp; the new normalised
   * shader uses the full t=[0, 2] range).  Mathematically rescaling by
   * `2 / (rangeMax − rangeMin)` over-pulls — distant galaxies clamp to
   * the blue end.  Leaving the value unscaled under-corrects in some
   * areas but never produces the catastrophic blue-clamp artefact, so
   * we keep the SPEC value as-is and let the shader apply it directly.
   *
   * If you tweak this for visual taste:
   *   - higher = more aggressive de-reddening of distant galaxies (risk
   *     of blue-clamp at the high-z end)
   *   - lower  = distant galaxies trend redder (the old undercorrected
   *     look)
   */
  kPerZ: number;
};
