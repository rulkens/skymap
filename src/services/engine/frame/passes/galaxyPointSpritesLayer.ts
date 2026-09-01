/**
 * galaxyPointSpritesLayer — every loaded galaxy from every visible source as an
 * instanced additive billboard in the HDR target; the headline content layer.
 *
 * Always on: per-source visibility is a shader-side `visibleSourceMask` uniform,
 * so hiding SDSS is a 4-byte write rather than a CPU-side skip. The renderer's
 * own loop skips a source at exactly 0 opacity, which is what keeps a completed
 * deep-zoom fade from rasterizing millions of alpha-0 instances.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { Source } from '../../../../data/sources';
import { packSelection, SELECTION_NONE_SENTINEL } from '../../../../data/selectionEncoding';
import { galaxyCatalogIdOf } from '../../../../utils/galaxyCatalogIdOf';
import { pickUniformBytesOf } from '../../helpers/pickUniformBytesOf';
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../../../../data/galaxyLodBands';
import { fadeBand } from '../../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from '../../presentation/scaleFadeBands';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

export const galaxyPointSpritesLayer: ContentLayer = {
  name: 'point-sprites',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(_state, _ctx, _view) {
    return true;
  },

  draw(pass, view, ctx, state) {
    const { galaxyPointRenderer, drawPxPerRad } = ctx;

    // Deep-zoom survey fade, keyed on distance from the heliocentric render origin
    // — NOT `cam.distance`, the orbit-to-focus radius. Spatial, so it is identical
    // for every source this frame; hoisted out of the per-source closure below.
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const surveyFade = fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc);

    // The shader compares a packed `(sourceCode << 26u) | instance_index` per
    // vertex; structure targets light no galaxy halo, so they take the sentinel.
    const selected = state.selection.select;
    const selectedPacked =
      selected !== null && selected.type === 'galaxyCatalog'
        ? packSelection(selected.source, selected.index)
        : SELECTION_NONE_SENTINEL;

    galaxyPointRenderer.draw(pass, view.vp, view.viewportPx, {
      pointSizePx: state.settings.galaxyCatalogs.sizePx,
      brightness: state.settings.galaxyCatalogs.brightness,
      selectedPacked,
      visibleSourceMask: ctx.visibleSourceMask,
      camPosWorld: view.camPos,
      pxPerRad: drawPxPerRad,
      provenance: state.settings.galaxyCatalogs.provenance,
      biasMode: state.settings.bias.mode,
      absMagLimit: state.settings.bias.absMagLimit,
      depthFadeEnabled: state.settings.galaxyCatalogs.depthFade,
      sbScale: state.settings.galaxyCatalogs.sbScale,
      sbMax: state.settings.galaxyCatalogs.sbMax,
      falloffStrength: state.settings.galaxyCatalogs.falloffStrength,
      // Same apparent-pixel band the procedural-disk layer fades IN over, from one
      // source of truth: drift between them re-creates the double-bright donut.
      pxFadeStart: PROCEDURAL_DISK_FADE_START_PX,
      pxFadeEnd: PROCEDURAL_DISK_FADE_END_PX,
      // @group(3): the engine owns one focus buffer, written once per frame in
      // renderFrame. At rest (blend 0) the shader multiplier is 1.0.
      focusBindGroup: state.gpu.focusUniform!.bindGroup,
      // The registry answers 1.0 for an unregistered handle, so a source that has
      // not registered yet draws at full opacity rather than disappearing. The
      // famous catalog is exempt from the survey fade on purpose: its ~20 curated
      // galaxies stay as landmarks at deep zoom while the survey points yield.
      fadeOpacityOf: (source) =>
        resolveLayerOpacity(state, ctx, { kind: 'galaxyCatalog', id: galaxyCatalogIdOf(source) }) *
        (source === Source.FamousGalaxy ? 1 : surveyFade),
    });
  },

  // @group(0) prefix contract: this row is first among the cosmological pickables,
  // and `drawPoints` uploads + binds the pick CameraUniforms even with zero
  // sources — the ring / disk pick pipelines read that same @group(0) prefix. So
  // running first, and calling `drawPoints` even on an empty list, is load-bearing.
  //
  // `ctx.visibleSourceMask` is the PICK mask here (`deriveSourceMasks(state).pick`),
  // and the opacity filter extends the mask on the INTENT fade only — picking
  // follows intent, not pixels (`deriveSourceMasks.ts:25-27`, #18 D8), so a clip
  // `fade()` dims these points without revoking their click target.
  drawPick(pass, view, ctx, state) {
    if (state.gpu.galaxyPickRenderer === null) return;
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const surveyFade = fadeBand(SCALE_FADE_BANDS.surveyDeepZoom, camDistMpc);
    const fades = state.subsystems.fades;
    const sources = Array.from(ctx.galaxyPointRenderer.loadedSources()).filter((s) => {
      if (((ctx.visibleSourceMask >> s.source) & 1) === 0) return false;
      const opacity =
        fades.opacityOf({ kind: 'galaxyCatalog', id: galaxyCatalogIdOf(s.source) }, ctx.nowMs) *
        (s.source === Source.FamousGalaxy ? 1 : surveyFade);
      return opacity !== 0;
    });
    state.gpu.galaxyPickRenderer.drawPoints(pass, sources, pickUniformBytesOf(view, ctx, state));
  },
};
