import type { RefObject } from 'react';
import type { EngineHandle } from './EngineHandle';

/**
 * Inputs to `useStructureIndex`.  `paletteOpen` triggers the snapshot of the
 * engine's loaded structures (anchors + bulk catalog) on each open; the hook
 * also reads `sourceCounts` from the engine slice as a recompute trigger so a
 * catalog that lands while the palette is open re-fires the snapshot.
 */
export type UseStructureIndexInput = {
  paletteOpen: boolean;
  engineHandleRef: RefObject<EngineHandle | null>;
};
