import type { SourceType } from '../../data/SourceType';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';

/**
 * EngineSourcesHandle — raw galaxy catalog access.
 *
 * `getCloud`/`getCloudObjIds` expose the in-memory GalaxyCatalog for
 * deep-link / alias-index consumers.  Visibility is dispatched directly
 * to the store; tier changes are driven by the tier saga.
 */
export type EngineSourcesHandle = {
  /** Return the full GalaxyCatalog for a source, or undefined if unloaded. */
  getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  /** Return just the objIDs array for a source (narrower contract). */
  getCloudObjIds: (source: SourceType) => BigUint64Array | undefined;
};
