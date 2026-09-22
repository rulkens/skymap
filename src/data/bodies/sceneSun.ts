/**
 * sceneSun — the Sun as a drawn record: its own one-row seed table, the
 * `SEEDED_STAR_CATALOGS` entry its registry row indexes into.
 *
 * Hand-authored rather than derived from the famous-star seed table, because
 * the Sun is its own source: sharing the map's table is what made every gate
 * the table touched need an `id === 'sun'` exemption. Its position is not here
 * — `SCENE_ANCHORS` roots it at the heliocentric origin, like every other star.
 */

import { SCALE_UNITS } from '../scaleUnits';
import { SOLAR_RADIUS_KM } from './solarRadiusKm';
import { temperatureToLinearRgb } from '../../utils/color/temperatureToLinearRgb';
import type { StarBody } from '../../@types/scene/StarBody';

/** IAU 2015 nominal effective temperature, the colour the descent renders. */
const SUN_TEMPERATURE_K = 5772;

/** V-band absolute magnitude — the yardstick every other row's `absMag` uses. */
const SUN_ABS_MAG = 4.83;

export const SCENE_SUN: readonly StarBody[] = [
  {
    id: 'sun',
    label: 'Sun',
    absMag: SUN_ABS_MAG,
    color: temperatureToLinearRgb(SUN_TEMPERATURE_K),
    // The radius constant is km (the wire/authored convention); runtime is metres.
    surface: { datumRadiusM: SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M, reliefM: [0, 0] },
  },
];
