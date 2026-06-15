import type { PickRenderer } from '../rendering/PickRenderer';
import type { SourceType } from '../data/SourceType';
import type { GalaxyCatalog } from '../data/galaxyCatalog/GalaxyCatalog';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { PickStructureStore } from './data/PickStructureStore';

/**
 * Inputs `createClickResolver` needs to turn a click position into a
 * resolved `FocusableTarget`. The pick renderer decodes the pixel; the
 * three accessors below mirror `ResolvePickDeps` so the resolver can hand
 * `resolvePick` everything it needs to build a `GalaxyInfo` /
 * `StructureInfo`. In production `wireInput` passes the live store
 * accessors; tests stub them.
 */
export type CreateClickResolverInput = {
  pickRenderer: PickRenderer;
  /** The live cloud for a galaxy-catalog code, or `undefined` mid tier-swap. */
  getCloud: (source: SourceType) => GalaxyCatalog | undefined;
  /** The famous sidecar that enriches Famous rows. */
  getFamousMeta: () => readonly FamousMetaEntry[];
  /**
   * Structure store projection `resolvePick` indexes to resolve a ring
   * hit's `(category, structureIndex)` to its record. In production
   * `wireInput` passes `state.data.structures`; tests stub a one-method
   * `{ byCategory }` object. An empty store resolves structure hits to
   * null — no phantom selection.
   */
  structures: PickStructureStore;
};
