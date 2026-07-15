/**
 * starCatalogSlot — factory for one survey star-catalog's asset slot.
 *
 * ONE factory serves EVERY `starCatalog` row of the registry, parameterized
 * by `source` — the same reuse seam the fetcher (`starCatalogFetcher`) and the
 * request (`StarCatalogReq`) draw along their `source` dimension. Where
 * `mcpmSlot` hard-codes its single `Source.Mcpm`, this factory closes over the
 * caller's `source`, so a future famous-star catalog wires the same builder
 * with a different registry row rather than a copy.
 *
 * On commit, hands the decoded `StarCatalog` to `starCatalogRenderer.upload`,
 * keyed by the source code. The renderer commits the records blob to a
 * per-source GPU storage buffer once and keeps the octree CPU-side; the star
 * layer walks each committed catalog's octree per frame (`loadedCatalogs`).
 * No fade replay: unlike the volume/galaxy layers, the star layer owns its own
 * distance-crossfade band (registry `crossfadePc`) rather than the
 * intent → fade bridge, so the commit registers data and nothing else.
 *
 * ### Renderer null-guard (pre-bootstrap)
 *
 * `state.gpu.starCatalogRenderer` is null until `initGpu` resolves (the
 * staged-construction pattern every GPU handle shares). A load that completes
 * before the renderer exists would otherwise throw in commit; guarding it — as
 * `mcpmSlot` guards `volumeFieldRenderer` — makes the pre-bootstrap window a
 * silent no-op. In practice the slot only loads after boot, but the guard keeps
 * the commit honest about the handle's lifecycle rather than assuming it.
 */
import { createAssetSlot } from '../AssetSlot';
import { starCatalogFetcher } from '../fetchers/starCatalogFetcher';
import { SOURCE_REGISTRY } from '../../../data/sources';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogReq } from '../../../@types/loading/StarCatalogReq';
import type { SourceType } from '../../../@types/data/SourceType';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

export function createStarCatalogSlot(
  source: SourceType,
  state: EngineState,
  _cb: EngineCallbacks,
): AssetSlot<StarCatalog, StarCatalogReq> {
  const id = SOURCE_REGISTRY[source].id;
  const slot = createAssetSlot<StarCatalog, StarCatalogReq>({
    name: `starCatalog:${id}`,
    fetch: starCatalogFetcher,
    commit: async (catalog) => {
      const renderer = state.gpu.starCatalogRenderer;
      if (!renderer) return;
      // Per-source records buffer committed once; the octree stays CPU-side for
      // the star layer to walk each frame. Replaces any previous upload for the
      // same source (a tier reload re-commits the new-resolution catalog).
      renderer.upload(source, catalog);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] ${id}: ${s.value.starCount.toLocaleString()} stars, ` +
          `${s.value.nodeCount.toLocaleString()} nodes`,
      );
    }
  });
  return slot;
}
