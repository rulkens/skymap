/** The plate's ruling frames: the ladder of intervals, the sky's axes per orientation frame,
 * and the globes ruled in their own geography. */

import type { Mat3 } from '../../@types/math/Mat3';
import type { OrientationFrameId } from '../../@types/camera/orientation/OrientationFrameId';
import type { AntiqueRulingStep } from '../../@types/rendering/AntiqueRulingStep';
import type { EarthBody } from '../../@types/scene/EarthBody';
import { SCENE_EARTH } from '../bodies/sceneEarth';
import { ORIENTATION_FRAMES } from '../orientation/orientationFrames';
import { mat3FromColumns } from '../../utils/math/mat3FromColumns';

const MIN = 1 / 60;

/** Ruling interval and the border ladder's cell under it, as c.1690 Dutch maps graduated
 * their borders; lat and lon each take the first rung ~GAP units apart at the plate's centre. */
export const ANTIQUE_RULING_STEPS: readonly AntiqueRulingStep[] = [
  { stepDeg: 5 * MIN, cellDeg: MIN },
  { stepDeg: 10 * MIN, cellDeg: MIN },
  { stepDeg: 20 * MIN, cellDeg: 5 * MIN },
  { stepDeg: 30 * MIN, cellDeg: 5 * MIN },
  { stepDeg: 1, cellDeg: 10 * MIN },
  { stepDeg: 2, cellDeg: 20 * MIN },
  { stepDeg: 5, cellDeg: 1 },
  { stepDeg: 10, cellDeg: 1 },
  { stepDeg: 15, cellDeg: 5 },
  { stepDeg: 30, cellDeg: 5 },
  { stepDeg: 45, cellDeg: 15 },
  { stepDeg: 90, cellDeg: 30 },
];
export const ANTIQUE_RULING_GAP_UNITS = 120;

/** Each orientation frame's axes as (longitude 0, longitude 90°, pole): `ORIENTATION_FRAMES`
 * keeps the pole in its middle column and the negated 90° axis in its third. */
export const ANTIQUE_SKY_RULING_AXES = Object.fromEntries(
  Object.entries(ORIENTATION_FRAMES).map(([id, m]) => [
    id,
    mat3FromColumns([m[0], m[1], m[2]], [-m[6], -m[7], -m[8]], [m[3], m[4], m[5]]),
  ]),
) as Record<OrientationFrameId, Mat3>;

/** Globes ruled in their own longitude and latitude, with the prime meridian their
 * numbers count from. Earth's is the Pico de Teide (16°38′32″ W), as Dutch maps of
 * c.1690 counted it: 0–360 eastward, so Amsterdam reads 21.5. */
export const ANTIQUE_GLOBE_RULINGS: readonly {
  readonly body: Pick<EarthBody, 'id' | 'surface'>;
  readonly lonOffsetDeg: number;
}[] = [{ body: SCENE_EARTH, lonOffsetDeg: 16.6423 }];

/** A globe's interior net fades in with its share of the plate (a speck gets none, a
 * whole globe a full net) and out as the ground scale gets fine, km per print unit: a
 * c.1690 regional map graduated its border only. The border reads the globe at any scale. */
export const ANTIQUE_GLOBE_NET_COVERAGE = [0.05, 0.3] as const;
export const ANTIQUE_GLOBE_NET_KM_PER_UNIT = [0.5, 2] as const;

/** A side number runs inward from the inner rule and ends within this many print units of
 * the plate's edge (shrunk to fit if longer): the plate shader's `NUMERAL_SIDE_REACH`. */
export const ANTIQUE_SIDE_NUMERAL_REACH_UNITS = 100;

/** A border number's minutes are set smaller than its degrees, as the maps set them. */
export const ANTIQUE_MINUTE_SCALE = 11 / 15;
