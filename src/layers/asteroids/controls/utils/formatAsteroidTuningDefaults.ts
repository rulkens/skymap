/**
 * The values a DebugPanel session moved off their defaults, as table rows ready to paste: each
 * class's under its `ASTEROID_CLASS_LOOK` row, then the global ones under their table's name. A colour
 * counts as changed by its hue's hex (the picker's resolution, and the row keeps the luminance), so
 * re-picking the default leaves it out; float tails are rounded. The look modes are not table rows.
 */
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidTuning } from '../../@types/AsteroidTuning';
import { ASTEROID_CLASSES } from '../../../../data/asteroids/asteroidClasses';
import { ASTEROID_CLASS_LOOK } from '../../points/data/asteroidClassLook';
import { ASTEROID_BELT_RAMP } from '../../points/data/asteroidBeltRamp';
import { ASTEROID_PHOTOMETRY } from '../../points/data/asteroidPhotometry';
import { ASTEROID_THINNING } from '../../points/data/asteroidThinning';
import { linearRgbToHex } from '../../../../utils/color/linearRgbToHex';
import { scaleToUnitMax } from '../../../../utils/color/scaleToUnitMax';

const tidy = (v: number): number => Number(v.toPrecision(6));
const round = (c: number): number => Math.round(c * 1e4) / 1e4;
const hueHex = (c: Readonly<Vec3>): string => linearRgbToHex(scaleToUnitMax(c));

/** The rows of `defaults` that `values` holds and moved: numbers by value, colours by hue. */
function changedRows(
  values: Readonly<Record<string, unknown>>,
  defaults: Readonly<Record<string, unknown>>,
): string[] {
  return Object.keys(defaults)
    .filter((key) => key in values)
    .flatMap((key) => {
      const [v, d] = [values[key], defaults[key]];
      if (typeof v === 'number') return v === d ? [] : [`${key}: ${tidy(v)},`];
      const [c, dc] = [v as Vec3, d as Vec3];
      return hueHex(c) === hueHex(dc) ? [] : [`${key}: [${c.map(round).join(', ')}],`];
    });
}

export function formatAsteroidTuningDefaults(tuning: AsteroidTuning): string {
  return [
    ...ASTEROID_CLASSES.map(
      (cls) =>
        [
          `ASTEROID_CLASS_LOOK.${cls}`,
          changedRows(tuning.perClass[cls], ASTEROID_CLASS_LOOK[cls]),
        ] as const,
    ),
    ['ASTEROID_PHOTOMETRY', changedRows(tuning, ASTEROID_PHOTOMETRY)] as const,
    ['ASTEROID_THINNING', changedRows(tuning, ASTEROID_THINNING)] as const,
    ['ASTEROID_BELT_RAMP', changedRows(tuning.beltRamp, ASTEROID_BELT_RAMP)] as const,
  ]
    .filter(([, rows]) => rows.length > 0)
    .map(([name, rows]) => [`// ${name}`, ...rows].join('\n'))
    .join('\n');
}
