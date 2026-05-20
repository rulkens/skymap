import type { EngineCallbacks } from '../EngineCallbacks';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { SourceType } from '../../data/SourceType';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../loading/FamousXrefMap';
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
  /** Live read of the famous-galaxy xref sidecar (cross-survey ID joins). */
  getFamousXrefs: () => FamousXrefMap;
  /**
   * Live read of the Milliquas per-tier names sidecar.  Closure (not
   * snapshot) so tier-change reloads land in subsequent picks without
   * the subsystem having to re-subscribe.  Empty array when the
   * sidecar hasn't resolved yet — `buildGalaxyInfo` falls back to the
   * IAU "MQ J<RA><Dec>" headline in that window.
   */
  getMilliquasNames: () => readonly string[];
  /**
   * Live read of the POI table.  Closure (not snapshot) so a tier
   * swap that replaces the POI list lands in subsequent lookups
   * without re-binding.  Returns null for unknown ids — the
   * subsystem treats that as "no POI to expand" and fires the
   * callback with null.
   */
  getPoi: (id: string) => PointOfInterest | null;
};
