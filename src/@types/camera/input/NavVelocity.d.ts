import type { Vec2 } from '../../../../packages/shared/src/@types/math/Vec2';

/** NavVelocity — per-axis navigator velocity, in ArmDelta units per SECOND. */
export type NavVelocity = {
  readonly orbit: Vec2;
  readonly look: Vec2;
  readonly zoom: number;
  readonly roll: number;
};
