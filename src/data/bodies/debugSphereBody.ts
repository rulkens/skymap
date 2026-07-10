/**
 * debugSphereBodies — the remaining foreground debug-sphere stand-in.
 *
 * A single true-scale body for `debugSpheresLayer` to draw. Earth is no
 * longer here: the live `BodyStore` supplies Earth's pose and `earthLayer`
 * draws the real textured Blue Marble at that position, so a flat debug
 * sphere at the identical spot would only occlude it. The Sun stand-in
 * survives until the star layers land to replace it, at which point this
 * file retires entirely.
 *
 * The one body is authored from `SCALE_UNITS` (no inline magic Mpc numbers)
 * so the physical-units → Mpc relationship stays explicit:
 *
 *   - **Sun** at the render origin (`[0, 0, 0]`), radius 696 340 km. The
 *     camera focuses here, so a sphere at the origin is the landmark the
 *     descent lands on — it confirms the foreground pass renders at all.
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
 * Stand-in foreground bodies, drawn in array order.
 *
 * Each is consumed by `debugSpheresLayer` via:
 *   `composeBodyMvp(view.slab.vp, body.positionMpc, RENDER_ORIGIN_MPC, body.radiusMpc)`
 */
export const DEBUG_SPHERE_BODIES: readonly DebugSphereBody[] = [
  {
    label: 'Sun',
    positionMpc: [0, 0, 0],
    radiusMpc: 696_340 * SCALE_UNITS.KM_TO_MPC,
  },
] as const;
