import type { Vec3 } from '../../../src/@types/math/Vec3';

/**
 * terrainUpEnu — the ground's up vector at a point, as (east, north, up), from
 * four heights a `baselineM` central difference apart. Pass the footprint the
 * body rests on, not one post: at a z17 tile's ~1.3 m spacing a single-post
 * difference reads quantisation, not the slope the body settles onto.
 */
export function terrainUpEnu(
  northM: number,
  southM: number,
  eastM: number,
  westM: number,
  baselineM: number,
): Vec3 {
  const gradNorth = (northM - southM) / (2 * baselineM);
  const gradEast = (eastM - westM) / (2 * baselineM);
  // The fitted plane's normal. The +1 z keeps the sign up-ward at any slope.
  const length = Math.hypot(gradEast, gradNorth, 1);
  return [-gradEast / length, -gradNorth / length, 1 / length];
}
