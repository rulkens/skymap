import type { CompassDegrees } from '../../@types/scene/CompassDegrees';

const AXIS_OF: Readonly<Record<string, { axis: 'lat' | 'lon'; sign: 1 | -1 }>> = {
  N: { axis: 'lat', sign: 1 },
  S: { axis: 'lat', sign: -1 },
  E: { axis: 'lon', sign: 1 },
  W: { axis: 'lon', sign: -1 },
};

/** One `"12.53°E"`-style token → signed degrees and the axis its letter names, or null if not a number. */
export function parseCompassDegrees(token: string): CompassDegrees | null {
  const stripped = token.replace('°', '');
  const letter = AXIS_OF[stripped.slice(-1).toUpperCase()];
  const numeric = letter === undefined ? stripped : stripped.slice(0, -1);
  const value = Number(numeric);
  if (!Number.isFinite(value) || numeric.length === 0) return null;
  return { deg: value * (letter?.sign ?? 1), axis: letter?.axis ?? null };
}
