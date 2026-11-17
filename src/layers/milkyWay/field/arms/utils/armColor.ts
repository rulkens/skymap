import { lerpVec3 } from '../../../../../utils/math/lerpVec3';
import type { Vec3 } from '../../../../../@types/math/Vec3';

/** Hot blue-white, nudged bluer with youngFraction — eyeball, echoing tempColorRamp(0.6 + 0.36*youngFraction)'s direction without matching its curve. */
const ARM_COLOR_OLD: Readonly<Vec3> = [0.8, 0.86, 1.0];

const ARM_COLOR_YOUNG: Readonly<Vec3> = [0.65, 0.78, 1.0];

/**
 * Arms sit inside the disc, so their populations skew with radius the same
 * way the disc's do (inside-out formation — see `galaxyFieldMixture.ts`'s
 * DISC_COLOR_INNER/OUTER). A second, independent cross-fade on top of the
 * age one above, kept a minority share (`ARM_RADIAL_STRENGTH`) so
 * `youngFraction` stays the dominant signal.
 */
const ARM_RADIAL_INNER: Readonly<Vec3> = [0.9, 0.85, 0.68];

const ARM_RADIAL_OUTER: Readonly<Vec3> = [0.6, 0.75, 1.0];

const ARM_RADIAL_STRENGTH = 0.4;

/** Exported so `deriveArmCloudCount.ts`'s sprites match the ridge chain's own colour exactly, rather than re-deriving it. */
export function armColor(youngFraction: number, radialT: number): Vec3 {
  const age = Math.min(1, Math.max(0, youngFraction));
  const ageColor = lerpVec3(ARM_COLOR_OLD, ARM_COLOR_YOUNG, age);
  const radial = Math.min(1, Math.max(0, radialT));
  const radialColor = lerpVec3(ARM_RADIAL_INNER, ARM_RADIAL_OUTER, radial);
  return lerpVec3(ageColor, radialColor, ARM_RADIAL_STRENGTH);
}
