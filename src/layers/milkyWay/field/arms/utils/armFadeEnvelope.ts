import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';

function smoothstep01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Where the outer taper begins, as a fraction of this arm's own `fadeRadius`
 * — the taper spans the outer 40% of the arm, comparable to the brightness
 * law it multiplies rather than swamping it.
 *
 * NOT `armFullRadius` (0.42 * fadeRadius, `describeGalaxy.ts`), which
 * `generate.wesl`'s sprite copy of this envelope still uses: at 0.42 the
 * smoothstep is a second radial brightness law on top of
 * `armExcessSurfaceShape`, one no knob can reach past — it alone cost the
 * Milky Way preset's arms a factor ~2 by the disc edge and drove them to
 * zero half a disc radius before the disc's own light ran out.
 */
const ARM_TAPER_START_FRAC = 0.6;

/** The analytic arms' radial extent: an inner ramp, and an outer taper to zero at this arm's own `fadeRadius`. Brightness along that extent is `armExcessSurfaceShape`'s job, not this one's — see `ARM_TAPER_START_FRAC`. */
export function armFadeEnvelope(
  radius: number,
  geometry: GalaxyDescription,
  arm: GalaxyFieldArmRecord,
): number {
  const innerT = (radius - geometry.armStartRadius) / geometry.armInnerRampW;
  const taperStart = arm.fadeRadius * ARM_TAPER_START_FRAC;
  const outerT = (radius - taperStart) / Math.max(0.001, arm.fadeRadius - taperStart);
  return smoothstep01(innerT) * (1 - smoothstep01(outerT));
}
