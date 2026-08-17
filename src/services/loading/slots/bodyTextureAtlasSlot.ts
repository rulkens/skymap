/**
 * bodyTextureAtlasSlot — factory for the low-resolution all-bodies surface
 * atlas: one fetch, fifteen placeholder seeds.
 *
 * ### Why this asset exists
 *
 * A body's own `(bodyId, kind)` texture slot is proximity-gated — it starts
 * loading only once the camera is already close enough to see the body — so a
 * body reached before its multi-megabyte map lands draws as a flat albedo
 * sphere. Rather than predicting where the camera will go, this asset ships ONE
 * 512x256 tile per textured body in a single ~180 KB image, fetched first
 * (`priority: 0` in `ASSET_WIRING`), so every body always has its own surface to
 * show. The hi-res map is then an upgrade, never a prerequisite.
 *
 * ### The commit is a fan-out, and the atlas is never bound
 *
 * The single decoded bitmap is a TRANSPORT container: each renderer crops its
 * tile out at upload into an ordinary per-body texture, so no shader, layout,
 * sampler or UV changes, and the atlas bitmap itself never becomes a bound
 * texture. Membership and tile order derive from `BODY_ATLAS_LAYOUT` (generated
 * from `BODY_TEXTURE_REGISTRY`, the only enumeration of the textured-body set) —
 * a hand-written list here would be a second enumeration free to drift from the
 * atlas the build actually emitted.
 *
 * The Earth-vs-other-bodies split is the same routing `commitBodyTexture`
 * performs for the hi-res family: Earth has its own renderer (the planned
 * atmosphere / day-night divergence), the other fourteen share
 * `texturedBodyRenderer`. Only `'surface'` is atlased.
 *
 * ### Why arrival order needs no check anywhere
 *
 * Both sinks write their renderer's PLACEHOLDER layer, never its committed-map
 * layer, so a hi-res map that landed first shadows the tile by construction and
 * a tile landing later cannot clobber it. That is why this commit contains no
 * "has the hi-res already arrived?" peek at slot state — such a check would
 * re-braid the loading fact back into the rendering path.
 *
 * The other order is equally free. `texturedBodyRenderer.resourcesFor` mints a
 * body's GPU resources lazily on first touch, so seeding a body that has never
 * been drawn simply creates its resources early and the tile is waiting there
 * when it first becomes drawable. And the renderers themselves cannot be
 * "late": `initGpu` (bootstrap phase 1) constructs both before `wireSlots`
 * (phase 2) even mints this slot, let alone loads it. The null-guards below are
 * therefore the destroy-race posture every other commit carries (a handle can be
 * null after a StrictMode unmount / hot-reload teardown), not an
 * ordering workaround: a null handle drops the upload silently and the slot
 * still transitions to `ready`.
 *
 * **Graceful degradation on error.** A failed fetch maps to "feature off": the
 * subscriber warns and every renderer keeps the 1x1 placeholder it drew before
 * this asset existed. The render wake is `installSlotReadyWake`'s job, not the
 * factory's.
 */

import { createAssetSlot } from '../AssetSlot';
import { bodyAtlasFetcher } from '../fetchers/bodyAtlasFetcher';
import { BODY_ATLAS_GRID, BODY_ATLAS_LAYOUT } from '../../../data/bodies/bodyAtlas.generated';
import { atlasTileRect } from '../../../utils/gpu/atlasTileRect';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { SlotFactory } from '../../../@types/loading/SlotFactory';

export const createBodyTextureAtlasSlot: SlotFactory<ImageBitmap, void> = (state, _cb) => {
  const slot = createAssetSlot({
    name: 'body-atlas',
    fetch: bodyAtlasFetcher,
    commit: async (atlas) => {
      // `Object.entries` widens a `Record<BodyTextureId, number>`'s keys to
      // `string` (TS models objects as open), so the pair is re-narrowed here.
      // Iterating the layout — rather than `BodyTextureId`'s members — keeps the
      // fan-out set and the emitted atlas the same generated fact.
      for (const [bodyId, index] of Object.entries(BODY_ATLAS_LAYOUT) as [
        BodyTextureId,
        number,
      ][]) {
        const rect = atlasTileRect(index, BODY_ATLAS_GRID.columns, {
          w: BODY_ATLAS_GRID.tileW,
          h: BODY_ATLAS_GRID.tileH,
        });
        if (bodyId === 'earth') {
          state.gpu.earthRenderer?.setPlaceholderMap('surface', atlas, rect);
        } else {
          state.gpu.texturedBodyRenderer?.setPlaceholderMap(bodyId, 'surface', atlas, rect);
        }
      }
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'error') {
      console.warn('[engine] body-texture atlas failed to load:', s.error);
    }
  });
  return slot;
};
