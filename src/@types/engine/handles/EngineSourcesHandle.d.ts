import type { LodMode } from '../../data/LodMode';
import type { Source } from '../../../data/sources';
import type { Tier } from '../../data/Tier';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';

/**
 * EngineSourcesHandle — survey lifecycle: visibility, tier, raw catalog access.
 *
 * `setLodMode` flips between auto-LOD (engine drives visibility from camera
 * distance) and manual (caller drives it).  `setVisible` toggles one survey
 * and implicitly switches to manual.  `setTier` hot-swaps the active data
 * tier across all surveys with per-source re-fetch.  `getCloud`/`getCloudObjIds`
 * expose the in-memory GalaxyCatalog for deep-link / alias-index consumers.
 */
export type EngineSourcesHandle = {
  /** Switch between 'auto' and 'manual' LOD modes. */
  setLodMode: (mode: LodMode) => void;
  /**
   * Toggle visibility of one survey; implicitly switches LOD to 'manual'.
   * Returns a Promise that resolves when the fade animation completes.
   * Callers that don't need to await the animation should fire-and-forget:
   * `void handle.sources.setVisible(s, v)`.
   */
  setVisible: (source: Source, visible: boolean) => Promise<void>;
  /** Hot-swap the active data tier (re-fetches per-source bins). */
  setTier: (tier: Tier) => void;
  /** Return the full GalaxyCatalog for a source, or undefined if unloaded. */
  getCloud: (source: Source) => GalaxyCatalog | undefined;
  /** Return just the objIDs array for a source (narrower contract). */
  getCloudObjIds: (source: Source) => BigUint64Array | undefined;
};
