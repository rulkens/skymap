import type { Rectangle } from 'electron';
import type { SkyWindowState } from '../@types/SkyWindowState';

const isRect = (value: unknown): value is Rectangle =>
  typeof value === 'object' &&
  value !== null &&
  ['x', 'y', 'width', 'height'].every((key) =>
    Number.isFinite((value as Record<string, unknown>)[key]),
  );

/** The stored state, or full screen when the file is missing or damaged: a show starts filling its screen. */
export function parseSkyWindowState(raw: unknown): SkyWindowState {
  if (typeof raw !== 'object' || raw === null) return { full: true, bounds: null };
  const { full, bounds } = raw as Record<string, unknown>;
  return { full: full !== false, bounds: isRect(bounds) ? bounds : null };
}
