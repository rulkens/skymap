/**
 * GalaxyArmSpurTuning — interarm spurs/feathers (`armSpurGeometry.ts`'s
 * `deriveArmSpurs`), nested under `GalaxyArmTuning` the way
 * `GalaxyArmCloudTuning` is: a sub-tier of the arm excess, not its own
 * top-level section.
 */
export type GalaxyArmSpurTuning = {
  /** Master toggle — off drops every spur record and hands `share` back to the ridge chain, same role `GalaxyArmCloudTuning.enabled` plays for the cloud. */
  readonly enabled: boolean;
  /**
   * 0..1 share of the arm excess carried by spur sprites instead of the
   * ridge chain, drawn from the SAME excess as `GalaxyArmCloudTuning.share`:
   * the two are clamped so `cloudShare + spurShare` never exceeds 1
   * (`buildGalaxyFieldMixture`'s `spurShare` clamp).
   */
  readonly share: number;
  /**
   * Multiplier on the base root-spacing law (feather spacing 300-800 pc,
   * La Vigne, Vogel & Ostriker 2006, re-expressed in disc-scale-length units
   * by `armSpurGeometry.ts`). 1 is that law exactly.
   */
  readonly spacing: number;
  /**
   * Openness: a spur's winding coefficient is the parent arm's own DIVIDED
   * by this, so >1 opens the spur toward radial — La Vigne+06's feathers run
   * more open than their parent. 1 traces the parent arm's own winding.
   */
  readonly pitchRatio: number;
  /**
   * A spur's `fadeRadius` sits this fraction of the LOCAL root spacing
   * beyond its root radius. The default sits toward the long end: a spur too
   * short to leave its parent's shadow reads as noise rather than the
   * gap-filling feature the interarm read is missing.
   */
  readonly lengthFrac: number;
  /** Fractional jitter on the root-to-root spacing draw — 0 is a perfectly regular comb, ~0.3 is what "quasi-regular" cites. */
  readonly jitter: number;
  /** Multiplier on each sprite's size draw, against the LOCAL `armCrossSigma` at that sprite's own radius — mirrors `GalaxyArmCloudTuning.sizeScale`. */
  readonly sizeScale: number;
  /** sigma_along / sigma_across — mirrors `GalaxyArmCloudTuning.elongation`. */
  readonly elongation: number;
  /**
   * 0..1 how strongly a spur forces the ISM map's fluid gas, against its
   * parent arm's own forcing (`galaxyIsmMapArmForcing.ts`). Default 0.5, not
   * 1: a spur is a short, low-mass offshoot, not a second arm — weighting it
   * as strongly as its parent would overdrive event placement along it.
   */
  readonly gasWeight: number;
};
