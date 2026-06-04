import type { RefObject } from 'react';
import type { SourceType } from '../data/SourceType';
import type { EngineHandle } from './EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { FocusableTarget } from './FocusableTarget';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { StructureRecord } from './data/StructureRecord';

/**
 * Combined input for `useUrlSync` — both galaxy-side and POI-side state
 * the hook needs to keep `location.hash` in lock-step with engine
 * selection.  Merge of the two legacy inputs (`UseFocusUrlInput` +
 * `UsePoiUrlSyncInput`) into one bag.
 *
 * The reactive fields drive their respective drain effects' re-runs
 * as data lands; `engineHandleRef` is a mutable ref because the engine
 * handle is constructed asynchronously during App mount and should
 * not retrigger this hook on assignment.
 */
export type UseUrlSyncInput = {
  /** Camera-focus target — galaxy or POI; drives the URL hash. */
  focused: FocusableTarget | null;
  status: EngineStatus;
  sourceCounts: Partial<Record<SourceType, number>>;
  famousMeta: readonly FamousMetaEntry[];
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  ready: boolean;
  pois: readonly StructureRecord[];
  engineHandleRef: RefObject<EngineHandle | null>;
};
