import type { RefObject } from 'react';
import type { Tier } from '../data/Tier';
import type { EngineHandle } from './EngineHandle';
import type { FocusableTarget } from './FocusableTarget';

/**
 * Inputs to `useStructureMemberCount`.  `tier` is a recompute trigger: a tier
 * swap changes the loaded data that the engine's `getCloud` returns, so the
 * member count must re-run.  `sourceCounts` is read from the engine Redux slice
 * inside the hook — also a recompute trigger (each per-source catalog landing
 * changes what `getCloud` returns).  `visibleSourceMask` is read directly so
 * toggling a galaxy catalog updates the count immediately.
 */
export type UseStructureMemberCountInput = {
  selected: FocusableTarget | null;
  engineHandleRef: RefObject<EngineHandle | null>;
  tier: Tier;
  visibleSourceMask: number;
};
