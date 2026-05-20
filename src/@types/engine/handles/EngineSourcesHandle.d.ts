import type { SourceType } from '../../data/Source';
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
   * Toggle visibility of one survey.  Returns a Promise that resolves when
   * the fade animation completes.  Callers that don't need to await the
   * animation should fire-and-forget:
   * `void handle.sources.setVisible(s, v)`.
   */
  setVisible: (source: SourceType, visible: boolean) => Promise<void>;
  /** Hot-swap the active data tier (re-fetches per-source bins). */
  setTier: (tier: Tier) => void;
  /** Return the full GalaxyCatalog for a source, or undefined if unloaded. */
  getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  /** Return just the objIDs array for a source (narrower contract). */
  getCloudObjIds: (source: SourceType) => BigUint64Array | undefined;
};
