/**
 * bodyTextureAtlasSlot — one fetch, one placeholder seed per textured body. A
 * body's own `(bodyId, kind)` slot is proximity-gated, so a body reached before its
 * multi-megabyte map lands would draw flat; this ~180 KB atlas, fetched at
 * `priority: 0`, makes the hi-res map an upgrade rather than a prerequisite. The
 * decoded bitmap is a TRANSPORT container — each renderer crops its tile at upload
 * into an ordinary per-body texture, so the atlas never becomes a bound texture and
 * no shader, layout, sampler or UV changes. Membership and tile order come from the
 * generated `BODY_ATLAS_LAYOUT`; a hand-written list would drift from the emitted atlas.
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
      // `Object.entries` widens a `Record<BodyTextureId, number>`'s keys to `string`
      // (TS models objects as open), so the pair is re-narrowed here. Iterating the
      // layout, not `BodyTextureId`, keeps fan-out and atlas one generated fact.
      for (const [bodyId, index] of Object.entries(BODY_ATLAS_LAYOUT) as [
        BodyTextureId,
        number,
      ][]) {
        const rect = atlasTileRect(index, BODY_ATLAS_GRID.columns, {
          w: BODY_ATLAS_GRID.tileW,
          h: BODY_ATLAS_GRID.tileH,
        });
        // Both sinks write the PLACEHOLDER layer, never the committed-map layer, so
        // a hi-res map that landed first shadows the tile and a late tile cannot
        // clobber it — no "has the hi-res arrived?" peek at slot state belongs here.
        // The `?.` is destroy-race posture (StrictMode teardown), not an ordering
        // guard: `initGpu` builds both renderers before `wireSlots` mints this slot.
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
