import type { EngineCallbacks } from '../EngineCallbacks';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/SourceType';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { PointOfInterest } from './PointOfInterest';

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
  getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  /** Live read of the famous-galaxy meta sidecar (curated names + thumbnail IDs). */
  getFamousMeta: () => readonly FamousMetaEntry[];
  /**
   * Live read of the POI table.  Closure (not snapshot) so a tier
   * swap that replaces the POI list lands in subsequent lookups
   * without re-binding.  Returns null for unknown ids — the
   * subsystem treats that as "no POI to expand" and fires the
   * callback with null.
   */
  getPoi: (id: string) => PointOfInterest | null;
};
