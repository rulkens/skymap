import {
  EARTH_EQUATORIAL_CIRCUMFERENCE_M,
  EARTH_EQUIRECT_BASE_WIDTH_PX,
} from '../../data/bodies/earthTileParams';

/**
 * earthTexelMetres — ground metres covered by one texel at pyramid level `z`,
 * measured at the equator (plate carrée over-samples toward the poles, a
 * bake-time storage cost since the planner never requests finer than the
 * screen needs). Independent of the tile edge: the level defines the full
 * equirect width, and how that's cut into tiles can't change ground-per-texel.
 *
 * For orientation: z = 4 is 4892 m (today's base texture), z = 13 is 9.55 m.
 */
export function earthTexelMetres(z: number): number {
  return EARTH_EQUATORIAL_CIRCUMFERENCE_M / (EARTH_EQUIRECT_BASE_WIDTH_PX << z);
}
