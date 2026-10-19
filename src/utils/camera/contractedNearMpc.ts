/**
 * contractedNearMpc — COSMO's near plane under a contracting boost. The fold
 * scales every ship-relative depth by 1/γ, so a galaxy that sat beyond the fixed
 * 10 kpc near plane lands inside it once γ passes a few hundred: the destination
 * vanished exactly when it closed in. Dividing the plane by γ keeps the same
 * Earth-frame content in front of it. Floored so the projection stays finite.
 */

import type { FrameBoost } from '../../@types/engine/frame/FrameBoost';

const NEAR_FLOOR_MPC = 1e-9;

export function contractedNearMpc(nearMpc: number, boost: FrameBoost | null): number {
  if (boost === null || !boost.contraction) return nearMpc;
  return Math.max(NEAR_FLOOR_MPC, nearMpc / boost.gamma);
}
