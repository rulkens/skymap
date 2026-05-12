import type { RefObject } from 'react';
import type { Source } from '../../data/sources';
import type { EngineHandle } from './EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { PointInfo } from './PointInfo';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../loading/FamousXrefMap';

/**
 * Inputs to the deep-link orchestrator hook.  The reactive ones drive
 * the drain effect's re-runs as data lands; `engineHandleRef` is a
 * mutable ref because the engine handle is constructed asynchronously
 * during App mount and should not retrigger this hook on assignment.
 */
export type UseFocusUrlInput = {
  focused: PointInfo | null;
  status: EngineStatus;
  sourceCounts: Partial<Record<Source, number>>;
  famousMeta: readonly FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  engineHandleRef: RefObject<EngineHandle | null>;
};
