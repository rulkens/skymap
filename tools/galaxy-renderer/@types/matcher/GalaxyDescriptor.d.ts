/**
 * GalaxyDescriptor — the rotation- and scale-invariant fingerprint the
 * matcher extracts from a galaxy image (a real photo or one of our renders).
 * Every field is normalised so the same galaxy at a different size, brightness
 * or on-screen rotation lands on (nearly) the same descriptor, which is what
 * lets `descriptorLoss` hill-climb the generator's parameters toward a
 * reference photo without first solving for pose.
 *
 * See `computeDescriptor` for how each field is measured; ported from the
 * spike's `galaxy-matcher.js`.
 */

export type GalaxyDescriptor = {
  readonly q: number; // axis ratio, 1 = round, →0 edge-on
  readonly rHalf: number; // half-light radius, px, floor 2
  readonly fluxFrac: Float32Array; // 15 radial bins over rho = r/rHalf ∈ [0, 3)
  readonly colorInner: number; // (R−B)/(R+G+B+1) flux-weighted, rho < 0.6
  readonly colorOuter: number; // same, 0.6 ≤ rho < 2.0
  readonly arm: Float32Array; // azimuthal residual harmonic magnitudes m = 1..6
  readonly dustIdx: number; // darker-than-local-mean absorption fraction
};
