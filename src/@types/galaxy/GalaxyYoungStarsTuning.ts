/**
 * GalaxyYoungStarsTuning — the chain-placed young-stars tier's own tunable
 * knobs (`v2/youngStarChain.ts`'s `buildYoungStarChain`), nested under
 * `GalaxyHiiTuning` where `GalaxyHiiAssociationsTuning`'s scattered-splat
 * tier used to sit. Replaces it: chains ride every arm's own ridge walk
 * (`sampleArmRidgeNodes`) instead of seeding off SF-event positions, so the
 * placement/shape knobs that bag carried (`complexes`, `armBias`,
 * `elongation`, `coherence`, `sizeScale`) have no analogue here — see
 * docs/superpowers/specs/2026-08-09-young-stars-field-design.md §3-4.
 */
export type GalaxyYoungStarsTuning = {
  readonly enabled: boolean;
  /** Total tier flux — the ONE flux knob, multiplied against `YOUNG_FLUX_REF` (`youngStarChain.ts`). 0 skips the tier. */
  readonly brightness: number;
  /** Chain ribbon's across-arm sigma as a fraction of `armCrossSigma`'s own width law. 1 is that law exactly. */
  readonly width: number;
  /** 0 = a smooth ribbon along the ridge, 1 = fully modulated by the ISM map's `stars` tracer — packs to each component's `starsWeight`. */
  readonly mapDepth: number;
  /** Gamma shaping the stars-map read (`splat.wesl`'s shader-side contrast term) — flux-neutral, mean-normalized so it restructures without draining total brightness. */
  readonly contrast: number;
  /** Star-grain noise weight, same convention every other HII group's own `texture` knob uses. */
  readonly texture: number;
  /**
   * Per-node weight gains a factor `radius^edgeBias`; weights renormalize to
   * the tier's fixed total flux, so this REDISTRIBUTES flux radially rather
   * than adding any. 0 = flat (surface brightness falls ~1/r, since
   * `armCrossSigma` grows with radius), ~1 = constant ribbon surface
   * brightness, ~2 = outer arms dominate (the M74-reference look).
   */
  readonly edgeBias: number;
};
