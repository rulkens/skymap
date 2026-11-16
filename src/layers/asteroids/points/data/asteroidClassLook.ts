import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { AsteroidClassLook } from '../../@types/AsteroidClassLook';

/**
 * The rows every class starts from. At a floor of V 16 a dot deposits well under 1/255. The knee is
 * a dot's peak ceiling, far under the stars' 8, so a patch reads by its dot count. Sized by H, a dot
 * keeps `dotRadiusPx` fainter than `sizeKneeH` and grows as t² to `sizeMaxScale` at
 * `ASTEROID_POINT_STYLE.sizeFullH`, so only the few largest bodies stand out from the field.
 */
const SHARED = {
  brightness: 1,
  limitingMag: 16,
  dotRadiusPx: 1.4,
  dotKnee: 0.2,
  sizeKneeH: 12,
  sizeMaxScale: 2.5,
} as const;

/**
 * Each class's look. The tints sit near unit luminance so a colour never changes how bright a dot
 * reads. The belt stays a neutral warm white; the groups it is drawn to show apart get the hues. The
 * Jupiter trojans take Jupiter's tan (the body palette's), nudged red; the Hildas go violet to stay apart.
 */
export const ASTEROID_CLASS_LOOK: Readonly<Record<AsteroidClass, AsteroidClassLook>> = {
  nearEarth: { ...SHARED, color: [1.35, 0.6, 0.45] },
  mainBelt: { ...SHARED, color: [1.05, 1.0, 0.92] },
  hilda: { ...SHARED, color: [1.3, 0.78, 1.7] },
  jupiterTrojan: { ...SHARED, color: [1.45, 0.88, 0.42] },
};
