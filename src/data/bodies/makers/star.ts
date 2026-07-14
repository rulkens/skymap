/**
 * star — row maker for the local star table.
 *
 * Keeps each entry a single legible line of human-unit values (J2000 RA/Dec in
 * degrees, distance in parsecs) while the Mpc conversion and the frame contract
 * (`raDecDistToCartesian`, the same right-handed equatorial J2000 conversion the
 * galaxy build pipeline uses) live in exactly one place. A POSITIONAL signature
 * is deliberate: the star table is a dense grid of numeric columns, and the
 * maker's job is to name those columns once here so each row reads as data.
 *
 * Lives beside `SCENE_STARS` in `makers/` rather than in `src/utils/`: it is
 * authoring policy, has a single consumer (the stars table), and maker and
 * table change together.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { raDecDistToCartesian } from '../../../utils/math/raDecDistToCartesian';
import type { StarBody } from '../../../@types/scene/StarBody';
import type { Vec3 } from '../../../@types/math/Vec3';

// The Sun's real radius; also the stated one-solar-radius placeholder every
// other star carries until a later LOD promotion resolves them to spheres.
// Module-local to the maker: `star()` is its only reader, and it cannot live in
// the stars table file without a circular import.
const SOLAR_RADIUS_KM = 696340;

export function star(
  id: string,
  label: string,
  raDeg: number,
  decDeg: number,
  distPc: number,
  absMag: number,
  color: Vec3,
): StarBody {
  return {
    id,
    label,
    positionMpc: raDecDistToCartesian(raDeg, decDeg, distPc * SCALE_UNITS.PC_TO_MPC),
    absMag,
    color,
    radiusKm: SOLAR_RADIUS_KM,
  };
}
