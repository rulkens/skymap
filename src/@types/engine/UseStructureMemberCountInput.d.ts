import type { RefObject } from 'react';
import type { SourceType } from '../data/SourceType';
import type { Tier } from '../data/Tier';
import type { EngineHandle } from './EngineHandle';
import type { FocusableTarget } from './FocusableTarget';

/**
 * Inputs to `useStructureMemberCount`.  `tier` and `sourceCounts` are
 * recompute triggers, not direct reads: a tier swap (and each per-source
 * catalog landing it fans out) changes the loaded data that the engine's
 * `getCloud` returns, so the member count must re-run.  `visibleSourceMask`
 * is read directly so toggling a survey updates the count immediately.
 */
export type UseStructureMemberCountInput = {
  selected: FocusableTarget | null;
  engineHandleRef: RefObject<EngineHandle | null>;
  tier: Tier;
  sourceCounts: Partial<Record<SourceType, number>>;
  visibleSourceMask: number;
};
