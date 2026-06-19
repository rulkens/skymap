import type { SourceType } from '../../data/SourceType';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';

/**
 * EngineSourcesHandle — galaxy catalog lifecycle: visibility + raw catalog access.
 *
 * `setVisible` toggles one galaxy catalog on/off with a fade animation.
 * `getCloud`/`getCloudObjIds` expose the in-memory GalaxyCatalog for
 * deep-link / alias-index consumers.  Tier is NOT a method here: a tier change
 * is an Intent dispatched from the UI (`requestTier`), driven by the tier saga.
 */
export type EngineSourcesHandle = {
  /**
   * Toggle visibility of one galaxy catalog.  Synchronous: flips the galaxy catalog's
   * `settings.galaxyCatalogs.items[id].enabled` (the single source of truth) and
   * fires the fade.  The draw/pick masks are DERIVED from that flag (by
   * `deriveSourceMasks`), not written here.  Call it plainly:
   * `handle.sources.setVisible(s, v)`.
   */
  setVisible: (source: SourceType, visible: boolean) => void;
  /** Return the full GalaxyCatalog for a source, or undefined if unloaded. */
  getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  /** Return just the objIDs array for a source (narrower contract). */
  getCloudObjIds: (source: SourceType) => BigUint64Array | undefined;
};
