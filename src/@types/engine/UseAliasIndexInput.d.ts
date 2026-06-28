import type { RefObject } from 'react';
import type { EngineHandle } from './EngineHandle';

/**
 * Inputs to `useAliasIndex`.  `sourceCounts` is read from the engine Redux
 * slice inside the hook — it gates the lazy GLADE/2MRS join and acts as a
 * recompute trigger.  `paletteOpen` triggers the first-open lazy load.
 */
export type UseAliasIndexInput = {
  paletteOpen: boolean;
  engineHandleRef: RefObject<EngineHandle | null>;
};
