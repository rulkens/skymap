/**
 * constellationsLayer — the 88 classical asterisms as additive lines between
 * their real member stars, so flying away shears the figures apart.
 *
 * The odd row out among the HDR layers: the endpoints sit at parsec-to-
 * kiloparsec scale, which COSMO's fixed 0.01 Mpc near plane would clip, so this
 * row projects through NEAR0 while still accumulating into the HDR target and
 * riding the same tone-map as the stars it connects.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { NEAR0 } from '../slabs';
import { rebaseViewProj } from '../../../../utils/camera/rebaseViewProj';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { constellationLayerOpacity } from '../../presentation/constellationLayerOpacity';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

// Screen-space pixels; eye-tuned heavier than the filament lines so the figures read.
const CONSTELLATION_LINE_HALFWIDTH_PX = 1.3;

// One dim steel-blue tone (RGB) for all 88 figures, emitted additively into HDR.
const CONSTELLATION_LINE_COLOR: Vec3 = [0.42, 0.58, 0.9];

export const constellationsLayer: ContentLayer = {
  name: 'constellations',
  slab: NEAR0,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    // Hard distance cull, keyed on heliocentric-origin distance in Mpc: once the
    // band reads 0 the layer disables regardless of the toggle ("opacity 0 ⇒ no
    // render"), which also empties the (hdr, NEAR0) step for this row.
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    // Opacity 1 reduces the shared product to the raw band.
    if (constellationLayerOpacity(camDistMpc, 1) === 0) return false;
    if (state.settings.constellations.enabled) return true;
    return state.subsystems.fades.opacityOf({ kind: 'constellations' }, ctx.nowMs) > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.constellationRenderer;
    if (renderer === null) return;
    // `constellationsSlot`'s commit owns the upload; this pass never uploads.
    if (!renderer.hasData()) return;

    const camPos = view.camPos;
    const camDistMpc = Math.hypot(camPos[0], camPos[1], camPos[2]);
    const toggleFade = resolveLayerOpacity(state, ctx, { kind: 'constellations' });
    const layerOpacity = constellationLayerOpacity(camDistMpc, toggleFade);

    // Multiplying absolute parsec-scale endpoints by an f32 vp cancels catastrophically
    // on approach and makes the lines hop, so fold the eye offset in at f64 — from the
    // slab's f64 `vp`, NOT the already-narrowed `view.vp` — and pair it with the
    // camera-relative endpoints the renderer writes per frame (the starPointsLayer seam).
    const rebasedVp = narrowMat4(rebaseViewProj(view.slab.vp, camPos));

    renderer.draw(
      pass,
      rebasedVp,
      view.viewportPx,
      CONSTELLATION_LINE_HALFWIDTH_PX,
      state.settings.constellations.intensity,
      layerOpacity,
      camPos,
      CONSTELLATION_LINE_COLOR,
    );
  },
};
