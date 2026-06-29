/**
 * debugSphereBodies — Plan-01 stand-ins for the foreground debug spheres.
 *
 * Seeds the foreground pass with a couple of true-scale bodies so
 * `encodeForegroundPass` has something to draw before the real BodyStore
 * (Plan 02) is wired up.  Plan 02 replaces these constants with live
 * `BodyStore` records; this file is deleted at that point.
 *
 * Two bodies, both authored from `SCALE_UNITS` (no inline magic Mpc
 * numbers) so the physical-units → Mpc relationship stays explicit:
 *
 *   - **Sun** at the render origin (`[0, 0, 0]`), radius 696 340 km. The
 *     camera focuses here, so a sphere at the origin is the landmark the
 *     descent lands on — it confirms the foreground pass renders at all and
 *     gives a scale reference for finding the (much smaller) Earth.
 *   - **Earth** at 1 AU along +X, radius 6371 km. A fixed placeholder
 *     position — the real Earth orbits, but that is irrelevant to the
 *     foreground-pass smoke test. At 1 AU the Sun subtends ~0.27° and Earth
 *     ~0.005°, so the Sun resolves first as you zoom in.
 *
 * Earth's radius (6371 km × KM_TO_MPC ≈ 2.07e-16 Mpc) sits far below
 * MIN_DISTANCE_MPC (1e-17 Mpc), so the camera can sit just off the surface.
 */

import { SCALE_UNITS } from '../scaleUnits';
import type { Vec3 } from '../../@types/math/Vec3';

/** A foreground debug body: a true-scale sphere at an absolute Mpc position. */
export type DebugSphereBody = {
  readonly label: string;
  readonly positionMpc: Readonly<Vec3>;
  readonly radiusMpc: number;
};

/**
 * Plan-01 stand-in bodies for the foreground pass, drawn in array order.
 *
 * Each is consumed by `encodeForegroundPass` via:
 *   `composeBodyMvp(ctx.foregroundVp, body.positionMpc, ctx.renderOrigin, body.radiusMpc)`
 */
export const DEBUG_SPHERE_BODIES: readonly DebugSphereBody[] = [
  {
    label: 'Sun',
    positionMpc: [0, 0, 0],
    radiusMpc: 696_340 * SCALE_UNITS.KM_TO_MPC,
  },
  {
    label: 'Earth',
    positionMpc: [1 * SCALE_UNITS.AU_TO_MPC, 0, 0],
    radiusMpc: 6371 * SCALE_UNITS.KM_TO_MPC,
  },
] as const;
