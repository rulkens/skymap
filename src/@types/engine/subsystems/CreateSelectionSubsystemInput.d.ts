import type { EngineCallbacks } from '../EngineCallbacks';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { Source } from '../../../data/sources';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../loading/FamousXrefMap';

/**
 * Hooks the subsystem needs from the outside world.  All passed once
 * at construction; the cloud / sidecar accessors are CLOSURES (not
 * values) so the subsystem reads the live state at call time — see
 * the module header for why that matters.
 */
export type CreateSelectionSubsystemInput = {
  /** UI-callback sink — only `onHoverChange` / `onSelectChange` are read. */
  cb: EngineCallbacks;
  /** Live read of source catalogs; closure rather than snapshot so tier swaps land. */
  getCloud: (source: Source) => GalaxyCatalog | undefined;
  /** Live read of the famous-galaxy meta sidecar (curated names + thumbnail IDs). */
  getFamousMeta: () => readonly FamousMetaEntry[];
  /** Live read of the famous-galaxy xref sidecar (cross-survey ID joins). */
  getFamousXrefs: () => FamousXrefMap;
};
