/**
 * The asteroids Layer's runtime: the decoded catalog's slot and the names file's slot. The Kepler
 * buffers, the dot renderer and the pick code join it with the GPU passes.
 */
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { AsteroidCatalog } from '../catalog/@types/AsteroidCatalog';

export type AsteroidsRuntime = {
  readonly slot: AssetSlot<AsteroidCatalog, void>;
  /** The raw names file; read on the first palette search. */
  readonly namesSlot: AssetSlot<ArrayBuffer, void>;
};
