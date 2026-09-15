/**
 * The site rung's fixed floors (spec §4.5). Deliberately sliderless — only the
 * band edges are tunable, in `CameraTuning`.
 */

export const SITE_RUNG: {
  readonly eyeFloorBoundingRadii: number;
  readonly elevationCeilRad: number;
} = {
  /** Minimum eye height above the site's tangent plane, in the site body's bounding radii. */
  eyeFloorBoundingRadii: 0.2,
  /** At exactly π/2 the heading has nowhere to go — the nadir degeneracy `CameraPose.roll` documents. */
  elevationCeilRad: Math.PI / 2 - 1e-3,
};
