import { DEFAULT_DOCK_FRACTION } from '../data/dockLimits';
import type { PersistedValue } from '../../../../../src/@types/state/PersistedValue';

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
