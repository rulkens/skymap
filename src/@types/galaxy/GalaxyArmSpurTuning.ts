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
   * 0..1 share of the arm excess (`pushArmRidges`'s `armExcessFlux`) carried
   * by spur sprites instead of the ridge chain — parallel to
   * `GalaxyArmCloudTuning.share`, and drawn from the SAME excess: the two
   * shares are clamped so `cloudShare + spurShare` never exceeds 1
   * (`buildGalaxyFieldMixture`'s `spurShare` clamp), so raising one at the
   * budget's edge starves the other rather than double-spending the excess.
   */
  readonly share: number;
  /**
   * Multiplier on the base root-spacing law: La Vigne, Vogel & Ostriker
   * (2006) measure feather spacing at 300-800 pc in nearby grand-design
   * spirals, re-expressed here in disc-scale-length units and growing with
   * radius the same way `armCrossSigma`'s width law does (`armSpurGeometry.ts`).
   * 1 is that law exactly.
   */
  readonly spacing: number;
  /**
   * Openness: a spur's winding coefficient (d angle / d logR, ~cot of the
   * astronomer's pitch angle) is the parent arm's own DIVIDED by this, so >1
   * opens the spur toward radial — La Vigne+06's feathers run more open than
   * their parent, the shear-induced trailing spurs of Kim & Ostriker (2002,
   * 2006). 1 traces the parent arm's own winding.
   */
  readonly pitchRatio: number;
  /**
   * A spur's `fadeRadius` sits this fraction of the LOCAL root spacing beyond
   * its root radius — short is a stub feather barely clearing the parent arm,
   * long approaches bridging the whole interarm gap to the next arm over. The
   * default sits toward the long end: a spur too short to leave its parent's
   * shadow reads as noise on the ridge rather than the gap-filling feature
   * the interarm read is missing.
   */
  readonly lengthFrac: number;
  /** Fractional jitter on the root-to-root spacing draw — 0 is a perfectly regular comb, ~0.3 is what "quasi-regular" cites. */
  readonly jitter: number;
  /** Multiplier on each sprite's size draw — mirrors `GalaxyArmCloudTuning.sizeScale`, drawn against the LOCAL `armCrossSigma` at that sprite's own radius, same as the arm cloud. */
  readonly sizeScale: number;
  /** sigma_along / sigma_across — mirrors `GalaxyArmCloudTuning.elongation`. */
  readonly elongation: number;
  /**
   * How strongly a spur forces the ISM map's fluid/automaton gas — 0..1
   * against a parent arm's own forcing (1 = a spur pushes gas exactly as
   * hard as the arm it branches from; `galaxyIsmMapArmForcing.ts`'s
   * `buildGalaxyIsmMapArmForcing` walks `buildArmSpurs`' records the same way
   * it walks `geometry.arms`, scaled by this weight). Default 0.5, not 1:
   * feathers ARE gas structures — La Vigne, Vogel & Ostriker (2006) detect
   * them primarily in dust — but a spur is a short, low-mass offshoot, not a
   * second arm; weighting it as strongly as its parent would seed the map's
   * events/dust/HII as densely along every feather as along the arms
   * themselves, overdriving event placement.
   */
  readonly gasWeight: number;
};
