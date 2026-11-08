import {
  JD_1965_JAN_1,
  JUPITER_TEXTURE_GRS_U,
  SYSTEM_III_MINUS_II_AT_1965_DEG,
  SYSTEM_III_MINUS_II_DRIFT_DEG_PER_DAY,
} from '../../data/bodies/jupiterGrsLongitude';
import { TEXTURE_PRIME_MERIDIAN_U } from '../../data/bodies/texturePrimeMeridianU';
import { grsSystemIILongitudeDeg } from './grsSystemIILongitudeDeg';

/**
 * Degrees to add to Jupiter's prime meridian W so the texture's spot sits at its real place
 * on `jd`. System III is west-positive and W's frame east-positive, so the real spot is
 * at body-fixed east longitude -L3; the texture draws it at (u - 0.5) * 360.
 */
export function jupiterGrsTextureLongitudeOffsetDeg(jd: number): number {
  const l3 =
    grsSystemIILongitudeDeg(jd) +
    SYSTEM_III_MINUS_II_AT_1965_DEG +
    SYSTEM_III_MINUS_II_DRIFT_DEG_PER_DAY * (jd - JD_1965_JAN_1);
  const textureEastLonDeg = (JUPITER_TEXTURE_GRS_U - TEXTURE_PRIME_MERIDIAN_U) * 360;
  return -l3 - textureEastLonDeg;
}
