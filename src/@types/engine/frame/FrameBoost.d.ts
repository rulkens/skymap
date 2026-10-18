/**
 * FrameBoost — the observer's inertial frame for this frame, relative to the scene's rest frame;
 * `null` wherever one is carried means the rest frame. Contributed by at most one Layer's `boost`
 * (`composeLayerBoost`) and folded into every slab's vp by `deriveSlabs` (`foldBoostIntoSlab`);
 * the recolouring renderers read the same value off `ctx.snapshot.boost`.
 */

import type { Vec3 } from '../../math/Vec3';

export type FrameBoost = {
  /** World Mpc; the fixed point of the contraction. */
  readonly shipMpc: Readonly<Vec3>;
  /** Unit, world (Earth-frame) direction of travel. */
  readonly dir: Readonly<Vec3>;
  readonly beta: number;
  readonly gamma: number;
  readonly contraction: boolean;
  readonly doppler: boolean;
  /** The headlight exponent k on the Doppler factor; 0 is off. */
  readonly headlight: number;
};
