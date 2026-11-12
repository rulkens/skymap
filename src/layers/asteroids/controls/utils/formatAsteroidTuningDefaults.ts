/**
 * The values a DebugPanel session moved off their defaults, as table rows ready to paste, each group
 * under its table's name. A colour counts as changed by its hue's hex (the picker's resolution, and
 * the row keeps the luminance), so re-picking the default leaves it out; float tails are rounded.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_CLASS_COLORS } from '../../points/data/asteroidClassColors';
import { ASTEROID_PHOTOMETRY } from '../../points/data/asteroidPhotometry';
import { ASTEROID_POINT_STYLE } from '../../points/data/asteroidPointStyle';
import { ASTEROID_THINNING } from '../../points/data/asteroidThinning';
import { linearRgbToHex } from '../../../../utils/color/linearRgbToHex';
import { scaleToUnitMax } from '../../../../utils/color/scaleToUnitMax';

const NUMBER_TABLES: readonly [string, Readonly<Record<string, number>>][] = [
  ['ASTEROID_PHOTOMETRY', ASTEROID_PHOTOMETRY],
  ['ASTEROID_POINT_STYLE', ASTEROID_POINT_STYLE],
  ['ASTEROID_THINNING', ASTEROID_THINNING],
];

const tidy = (v: number): number => Number(v.toPrecision(6));
const round = (c: number): number => Math.round(c * 1e4) / 1e4;
const hueHex = (c: Readonly<Vec3>): string => linearRgbToHex(scaleToUnitMax(c));

export function formatAsteroidTuningDefaults(tuning: AsteroidTuning): string {
  const groups = NUMBER_TABLES.map(([name, defaults]) => {
    const rows = Object.keys(defaults)
      .filter((key) => key in tuning && tuning[key as AsteroidTuningSliderKey] !== defaults[key])
      .map((key) => `${key}: ${tidy(tuning[key as AsteroidTuningSliderKey])},`);
    return [name, rows] as const;
  });
  const colorRows = ASTEROID_CLASSES.filter(
    (cls) => hueHex(tuning.colors[cls]) !== hueHex(ASTEROID_CLASS_COLORS[cls]),
  ).map((cls) => `${cls}: [${tuning.colors[cls].map(round).join(', ')}],`);
  return [...groups, ['ASTEROID_CLASS_COLORS', colorRows] as const]
    .filter(([, rows]) => rows.length > 0)
    .map(([name, rows]) => [`// ${name}`, ...rows].join('\n'))
    .join('\n');
}
