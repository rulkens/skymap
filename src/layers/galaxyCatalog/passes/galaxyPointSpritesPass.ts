/**
 * galaxyPointSpritesPass — every loaded galaxy from every visible source as an
 * instanced additive billboard in the HDR target; the headline content layer.
 * Flat sources draw first, then the octree sources' leaves through their frame
 * cut; their blobs are `galaxyAggregatesPass`. Core skips the pass when every
 * catalog's handed value is 0; within it, the renderer's own loop skips a source
 * at exactly 0 opacity, which is what keeps a hidden catalog or a completed
 * deep-zoom band from rasterizing millions of alpha-0 instances.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';
import type { SourceType } from '../../../@types/data/SourceType';
import { packSelection, SELECTION_NONE_SENTINEL } from '../../../data/selectionEncoding';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { pickUniformBytesOf } from '../render/pickUniformBytesOf';
import { galaxyPointDrawSettingsOf } from '../render/galaxyPointDrawSettingsOf';
import { pooledSelectedPackedOf } from '../render/pooledSelectedPackedOf';

export function galaxyPointSpritesPass(runtime: GalaxyCatalogRuntime): ContentPass<'survey'> {
  return {
    name: 'point-sprites',
    fade: 'survey',

    // No handle gate: the renderer lives as long as the Layer does.
    enabled: () => true,

    draw(pass, view, ctx, state, fade) {
      // The shader compares a packed `(sourceCode << 26u) | instance_index` per
      // vertex; structure targets light no galaxy halo, so they take the sentinel.
      const select = state.selection.select;
      const selectedPacked =
        select !== null && select.type === 'galaxyCatalog'
          ? packSelection(select.source, select.index)
          : SELECTION_NONE_SENTINEL;
      const settings = galaxyPointDrawSettingsOf(
        view,
        ctx,
        state,
        fade,
        selectedPacked,
        runtime.focusBindGroup,
      );
      runtime.pointRenderer.draw(pass, view.vp, view.viewportPx, settings);

      const pooled = runtime.pooledPointRenderer;
      pooled.draw(
        pass,
        view.vp,
        view.viewportPx,
        { ...settings, selectedPacked: pooledSelectedPackedOf(pooled, select) },
        ctx.viewKind === 'capture',
        'leaf',
        state.settings.galaxyCatalogs,
      );
    },

    // Pick takes exactly the sources the draw takes: the same handed value, so a
    // catalog that is invisible, faded or clipped to 0 is not clickable either.
    drawPick(pass, view, ctx, state, fade) {
      const visible = (source: SourceType) => fade[galaxyCatalogIdOf(source)] !== 0;
      const sources = Array.from(runtime.pointRenderer.loadedSources()).filter((s) =>
        visible(s.source),
      );
      const uniformBytes = pickUniformBytesOf(view, ctx, state);
      runtime.pickRenderer.drawFlatPoints(pass, sources, uniformBytes);
      runtime.pooledPointRenderer.snapshotPickSlots();
      runtime.pickRenderer.drawPooledPoints(
        pass,
        runtime.pooledPointRenderer.pickDraws(visible),
        uniformBytes,
      );
    },
  };
}
