import type { EngineStatus } from '../engine/EngineStatus';
import type { LoadProgressState } from '../loading/LoadProgressState';

/**
 * UseSplashInput — the signals the splash hook needs from upstream
 * hooks (useEngine, useFamousMeta).  Keeping these as a struct rather
 * than positional args means App.tsx can wire them in any order without
 * silently mis-binding two booleans.
 */
export type UseSplashInput = {
  /** Engine status from `useEngine`. */
  status: EngineStatus;
  /** Aggregated load progress from `useEngine`. `null` when no fetches in flight. */
  loadProgress: LoadProgressState | null;
  /** Famous-meta `ready` flag from `useFamousMeta`. */
  famousMetaReady: boolean;
};
