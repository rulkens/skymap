import type { SourceType } from '../../data/SourceType';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { StructureInfo } from '../../data/structure/StructureInfo';

/**
 * EngineSourcesHandle — raw catalog access for read-only consumers.
 *
 * `getCloud`/`getCloudObjIds` expose the in-memory GalaxyCatalog for
 * deep-link / alias-index consumers; `getStructures` exposes the loaded
 * structure records for the command palette's structure index.  Visibility
 * is dispatched directly to the store; tier changes are driven by the tier
 * saga.
 */
export type EngineSourcesHandle = {
  /** Return the full GalaxyCatalog for a source, or undefined if unloaded. */
  getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  /** Return just the objIDs array for a source (narrower contract). */
  getCloudObjIds: (source: SourceType) => BigUint64Array | undefined;
  /**
   * Snapshot of every loaded structure record (featured anchors + bulk
   * catalog), in `anchors` → `bulk` order.  Empty until the structure catalog
   * lands; the palette re-snapshots on each open.
   */
  getStructures: () => readonly StructureInfo[];
};
