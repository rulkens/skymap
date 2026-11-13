/**
 * The values a DebugPanel session moved off their defaults, as table rows ready to paste, each group
 * under its table's name. A colour counts as changed by its hue's hex (the picker's resolution, and
 * the row keeps the luminance), so re-picking the default leaves it out; float tails are rounded.
 * The look modes are not table rows, so they are left out.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import type { AsteroidTuningSliderKey } from '../../@types/AsteroidTuningSliderKey';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_CLASS_COLORS } from '../../points/data/asteroidClassColors';
import { ASTEROID_BELT_RAMP } from '../../points/data/asteroidBeltRamp';
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
const colorRows = <K extends string>(
  keys: readonly K[],
  colors: Readonly<Record<K, Vec3>>,
  defaults: Readonly<Record<K, Vec3>>,
): string[] =>
  keys
    .filter((k) => hueHex(colors[k]) !== hueHex(defaults[k]))
    .map((k) => `${k}: [${colors[k].map(round).join(', ')}],`);

export function formatAsteroidTuningDefaults(tuning: AsteroidTuning): string {
  const groups = NUMBER_TABLES.map(([name, defaults]) => {
    const rows = Object.keys(defaults)
      .filter((key) => key in tuning && tuning[key as AsteroidTuningSliderKey] !== defaults[key])
      .map((key) => `${key}: ${tidy(tuning[key as AsteroidTuningSliderKey])},`);
    return [name, rows] as const;
  });
  return [
    ...groups,
    [
      'ASTEROID_CLASS_COLORS',
      colorRows(ASTEROID_CLASSES, tuning.colors, ASTEROID_CLASS_COLORS),
    ] as const,
    [
      'ASTEROID_BELT_RAMP',
      colorRows(['inner', 'outer'] as const, tuning.beltRamp, ASTEROID_BELT_RAMP),
    ] as const,
  ]
    .filter(([, rows]) => rows.length > 0)
    .map(([name, rows]) => [`// ${name}`, ...rows].join('\n'))
    .join('\n');
}
