import type { RefObject } from 'react';
import type { SourceType } from '../data/SourceType';
import type { EngineHandle } from './EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { GalaxyInfo } from './GalaxyInfo';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../loading/FamousXrefMap';
import type { PointOfInterest } from './subsystems/PointOfInterest';

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
  // Galaxy side
  focused: GalaxyInfo | null;
  status: EngineStatus;
  sourceCounts: Partial<Record<SourceType, number>>;
  famousMeta: readonly FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  // POI side
  focusedPoiId: string | null;
  ready: boolean;
  pois: readonly PointOfInterest[];
  // Shared
  engineHandleRef: RefObject<EngineHandle | null>;
};
