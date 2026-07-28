import {
  EARTH_EQUATORIAL_CIRCUMFERENCE_M,
  EARTH_EQUIRECT_BASE_WIDTH_PX,
} from '../../data/bodies/earthTileParams';

/**
 * earthTexelMetres — ground metres covered by one texel at pyramid level `z`,
 * measured at the equator.
 *
 * Independent of the tile edge: the level defines the full equirect width
 * (`EARTH_EQUIRECT_BASE_WIDTH_PX << z`), and how that width is cut into tiles is
 * a packaging decision that cannot change how much ground a texel covers.
 *
 * At the equator, because plate carrée over-samples toward the poles: a row at
 * 85° latitude covers roughly one eleventh the ground per texel that the
 * equatorial row does. That asymmetry is a bake-time storage cost, not a runtime
 * one — the planner never requests a level finer than the screen needs, so
 * over-sampled polar tiles are simply never fetched.
 *
 * The ladder this anchors, for orientation: z = 4 is 4892 m (today's whole-globe
 * base texture), z = 11 is 38.2 m, z = 13 is 9.55 m.
 */
export function earthTexelMetres(z: number): number {
  return EARTH_EQUATORIAL_CIRCUMFERENCE_M / (EARTH_EQUIRECT_BASE_WIDTH_PX << z);
}
