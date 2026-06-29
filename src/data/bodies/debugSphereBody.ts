/**
 * debugSphereBody — Plan-01 stand-in for the foreground debug sphere.
 *
 * Seeds the foreground pass with an Earth-sized body at a plausible 1-AU
 * position so `encodeForegroundPass` has something to draw before the real
 * BodyStore (Plan 02) is wired up.  Plan 02 replaces this constant with a
 * live `BodyStore.earth` record; this file is deleted at that point.
 *
 * Values are derived from `SCALE_UNITS` — no inline magic Mpc numbers —
 * so the relationship between physical units and the renderer's Mpc
 * coordinate frame stays explicit and auditable.
 *
 * Position: Earth at 1 AU from the Sun along the +X axis (the Sun sits
 * at `RENDER_ORIGIN_MPC = [0, 0, 0]`).  This is a fixed placeholder; the
 * real Earth position varies over the year and is not relevant for the
 * Plan-01 foreground-pass smoke test.
 *
 * Radius: IAU nominal Earth radius 6371 km, converted to Mpc.
 * 6371 km × KM_TO_MPC ≈ 2.07e-17 Mpc — deep below MIN_DISTANCE_MPC (1e-17
 * Mpc), so the camera can sit just off the surface.
 */

import { SCALE_UNITS } from '../scaleUnits';
import type { Vec3 } from '../../@types/math/Vec3';

/**
 * Plan-01 stand-in for Earth in the foreground pass.
 *
 * `positionMpc` is 1 AU along the +X axis from the render origin (the Sun).
 * `radiusMpc` is Earth's IAU nominal mean radius (6371 km) expressed in Mpc.
 *
 * Consumed by `encodeForegroundPass` via:
 *   `composeBodyMvp(ctx.foregroundVp, DEBUG_SPHERE_BODY.positionMpc, ctx.renderOrigin, DEBUG_SPHERE_BODY.radiusMpc)`
 */
export const DEBUG_SPHERE_BODY: {
  readonly positionMpc: Readonly<Vec3>;
  readonly radiusMpc: number;
} = {
  positionMpc: [1 * SCALE_UNITS.AU_TO_MPC, 0, 0],
  radiusMpc: 6371 * SCALE_UNITS.KM_TO_MPC,
} as const;
