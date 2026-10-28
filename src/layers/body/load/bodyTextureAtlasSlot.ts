/**
 * bodyTextureAtlasSlot — one fetch, one placeholder seed per textured body, so a body
 * reached before its proximity-gated multi-MB map lands is not flat. The bitmap is a
 * TRANSPORT container: each renderer crops its tile into an ordinary per-body texture,
 * so no shader, layout, sampler or UV changes. Membership and tile order come from the
 * generated `BODY_ATLAS_LAYOUT`.
 */

import { createAssetSlot } from '../../../services/loading/AssetSlot';
import { bodyAtlasFetcher } from './bodyAtlasFetcher';
import { BODY_ATLAS_GRID, BODY_ATLAS_LAYOUT } from '../../../data/bodies/bodyAtlas.generated';
import { atlasTileRect } from '../../../utils/gpu/atlasTileRect';
import { closeBitmap } from '../../../utils/gpu/closeBitmap';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { BodyTextureSinks } from '../@types/BodyTextureSinks';

export function createBodyTextureAtlasSlot(
  renderers: Pick<BodyTextureSinks, 'earthRenderer' | 'texturedBodyRenderer'>,
): AssetSlot<ImageBitmap, void> {
  const slot = createAssetSlot({
    name: 'body-atlas',
    fetch: bodyAtlasFetcher,
    commit: async (atlas) => {
      // `Object.entries` widens keys to `string`, hence the re-narrowing cast.
      for (const [bodyId, index] of Object.entries(BODY_ATLAS_LAYOUT) as [
        BodyTextureId,
        number,
      ][]) {
        const rect = atlasTileRect(index, BODY_ATLAS_GRID.columns, {
          w: BODY_ATLAS_GRID.tileW,
          h: BODY_ATLAS_GRID.tileH,
        });
        // Both sinks write the PLACEHOLDER layer, so a late tile cannot clobber a hi-res map that landed first.
        if (bodyId === 'earth') {
          renderers.earthRenderer.setPlaceholderMap('surface', atlas, rect);
        } else {
          renderers.texturedBodyRenderer.setPlaceholderMap(bodyId, 'surface', atlas, rect);
        }
      }
      atlas.close();
    },
    dispose: closeBitmap,
  });
  slot.subscribe((s) => {
    if (s.kind === 'error') {
      console.warn('[engine] body-texture atlas failed to load:', s.error);
    }
  });
  return slot;
}
