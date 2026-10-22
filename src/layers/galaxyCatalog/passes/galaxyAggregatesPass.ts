/**
 * galaxyAggregatesPass — the octree galaxy sources' blobs (each a refined-away
 * subtree's box-filling glow, D9) into the HDR target beside `galaxyPointSpritesPass`,
 * which draws their leaves. Its own pass so GPU timings bill the blobs on their own
 * row, as `star-aggregates` does for stars; the merged strategy encodes it inside
 * the same hdr·COSMO render pass. No pick: blobs are not galaxies.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';
import { galaxyPointDrawSettingsOf } from '../render/galaxyPointDrawSettingsOf';
import { pooledSelectedPackedOf } from '../render/pooledSelectedPackedOf';

export function galaxyAggregatesPass(runtime: GalaxyCatalogRuntime): ContentPass<'survey'> {
  return {
    name: 'galaxy-aggregates',
    fade: 'survey',

    // No handle gate, as the sprites pass: the renderer lives as long as the Layer does.
    enabled: () => true,

    draw(pass, view, ctx, state, fade) {
      const pooled = runtime.pooledPointRenderer;
      const selectedPacked = pooledSelectedPackedOf(pooled, state.selection.select);
      pooled.draw(
        pass,
        view.vp,
        view.viewportPx,
        galaxyPointDrawSettingsOf(view, ctx, state, fade, selectedPacked),
        ctx.viewKind === 'capture',
        'aggregate',
        state.settings.galaxyCatalogs,
      );
    },
  };
}
