import type { SourceType } from '../../data/SourceType';
import type { Tier } from '../../data/Tier';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';

/**
 * EngineSourcesHandle — survey lifecycle: visibility, tier, raw catalog access.
 *
 * `setVisible` toggles one survey on/off with a fade animation.  `setTier`
 * hot-swaps the active data tier across all surveys with per-source re-fetch.
 * `getCloud`/`getCloudObjIds` expose the in-memory GalaxyCatalog for
 * deep-link / alias-index consumers.
 */
export type EngineSourcesHandle = {
  /**
   * Toggle visibility of one survey.  Synchronous: flips the survey's
   * `settings.surveys.items[id].enabled` (the single source of truth) and
   * fires the fade.  The draw/pick masks are DERIVED from that flag (by
   * `deriveSourceMasks`), not written here.  Call it plainly:
   * `handle.sources.setVisible(s, v)`.
   */
  setVisible: (source: SourceType, visible: boolean) => void;
  /** Hot-swap the active data tier (re-fetches per-source bins). */
  setTier: (tier: Tier) => void;
  /** Return the full GalaxyCatalog for a source, or undefined if unloaded. */
  getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  /** Return just the objIDs array for a source (narrower contract). */
  getCloudObjIds: (source: SourceType) => BigUint64Array | undefined;
};
