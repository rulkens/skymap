import type { PersistedValue } from '../../../../../src/@types/state/PersistedValue';

/** The dock's height as a share of the viewport. The 3D view keeps at least 35% (Q12). */
export const MIN_DOCK_FRACTION = 0.25;
export const MAX_DOCK_FRACTION = 0.65;
export const DEFAULT_DOCK_FRACTION = 0.5;
/** One arrow press on the grabber. */
export const DOCK_STEP = 0.05;

/**
 * The remembered height, as the shared storage helpers want it. It is view state, not store
 * state, so `select` is never called (the dock writes the value itself); it only satisfies the type.
 */
export const DOCK_HEIGHT_ROW: PersistedValue<number> = {
  key: 'skymap.studio.dockHeight',
  select: () => DEFAULT_DOCK_FRACTION,
  parse: (raw) => {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  },
  serialize: String,
};
