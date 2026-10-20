/**
 * galaxyPointSpritesPass — every loaded galaxy from every visible source as an
 * instanced additive billboard in the HDR target; the headline content layer.
 * Core skips the pass when every catalog's handed value is 0; within it, the
 * renderer's own loop skips a source at exactly 0 opacity, which is what keeps
 * a hidden catalog or a completed deep-zoom band from rasterizing millions of
 * alpha-0 instances.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';
import { packSelection, SELECTION_NONE_SENTINEL } from '../../../data/selectionEncoding';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { pickUniformBytesOf } from '../render/pickUniformBytesOf';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../../data/galaxyLodBands';

export function galaxyPointSpritesPass(runtime: GalaxyCatalogRuntime): ContentPass<'survey'> {
  return {
    name: 'point-sprites',
    fade: 'survey',

    // No handle gate: the renderer lives as long as the Layer does.
    enabled: () => true,

    draw(pass, view, ctx, state, fade) {
      const { drawPxPerRad } = ctx;

      // The shader compares a packed `(sourceCode << 26u) | instance_index` per
      // vertex; structure targets light no galaxy halo, so they take the sentinel.
      const selected = state.selection.select;
      const selectedPacked =
        selected !== null && selected.type === 'galaxyCatalog'
          ? packSelection(selected.source, selected.index)
          : SELECTION_NONE_SENTINEL;

      runtime.pointRenderer.draw(pass, view.vp, view.viewportPx, {
        viewSlot: ctx.viewSlot,
        pointSizePx: state.settings.galaxyCatalogs.sizePx,
        brightness: state.settings.galaxyCatalogs.brightness,
        selectedPacked,
        camPosWorld: view.camPos,
        pxPerRad: drawPxPerRad,
        provenance: state.settings.galaxyCatalogs.provenance,
        biasMode: state.settings.bias.mode,
        absMagLimit: state.settings.bias.absMagLimit,
        depthFadeEnabled: state.settings.galaxyCatalogs.depthFade,
        sbScale: state.settings.galaxyCatalogs.sbScale,
        sbMax: state.settings.galaxyCatalogs.sbMax,
        falloffStrength: state.settings.galaxyCatalogs.falloffStrength,
        // Same apparent-pixel band the procedural-disk layer fades IN over, from
        // one source of truth: drift between them re-creates the double-bright donut.
        pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
        pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
        // @group(3): the engine owns one focus buffer, written once per frame in
        // renderFrame. At rest (blend 0) the shader multiplier is 1.0.
        focusBindGroup: state.gpu.focusUniform!.bindGroup,
        fadeOpacityOf: (source) => fade[galaxyCatalogIdOf(source)],
      });
    },

    // Pick takes exactly the sources the draw takes: the same handed value, so a
    // catalog that is invisible, faded or clipped to 0 is not clickable either.
    drawPick(pass, view, ctx, state, fade) {
      const sources = Array.from(runtime.pointRenderer.loadedSources()).filter(
        (s) => fade[galaxyCatalogIdOf(s.source)] !== 0,
      );
      runtime.pickRenderer.drawPoints(pass, sources, pickUniformBytesOf(view, ctx, state));
    },
  };
}
