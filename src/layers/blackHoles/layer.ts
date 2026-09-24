/**
 * The blackHoles Layer: the scene's supermassive black holes — the lens
 * renderer and pass, the `sky-cubemap` target the lens samples, one `lens`
 * slab row per hole, the lens tuning settings and their DebugPanel section.
 * The sky capture that fills the cubemap stays in core (`CUBEMAP_CAPTURES`).
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { HDR_TARGET_FORMAT } from '../../data/renderTargetFormats';
import { captureRowAllocateWhen } from '../../utils/gpu/captureRowAllocateWhen';
import { blackHolesLayerSettings } from './state/slices';
import { BLACK_HOLES } from './data/blackHoles';
import { create } from './create';
import { destroy } from './destroy';
import { blackHoleLensingPass } from './passes/blackHoleLensingPass';
import { blackHoleSlabRow } from './present/blackHoleSlabRow';
import SgrAStarLensingTuningSectionContainer from './ui/SgrAStarLensingTuningSectionContainer';

export const blackHolesLayer = defineLayer({
  name: 'blackHoles',
  settings: blackHolesLayerSettings,
  targets: [
    // The lens's captured environment: 6 layers of a fixed-size 2d-array,
    // later bound as a `texture_cube` (see `CubeFace.d.ts`). Same
    // depthless/additive/zero-clear profile as `hdr` — the captured roster
    // (`frameOrder.ts`'s sky capture line) is additive.
    //
    // Lazily allocated: 1024² × 6 × 8 B is 50 MB, and the lens draws only
    // within ~500 AU of Sgr A*, so the texture exists only while the band does.
    // `scheduleSkyCaptures` writes the band flag and reconciles on its edge, so
    // the row is there on the band-entry frame — the frame that sweeps all six
    // faces.
    {
      id: 'sky-cubemap',
      format: HDR_TARGET_FORMAT,
      depth: null,
      scale: 1, // unused: fixedSizePx below overrides it (required by the type).
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      allocateWhen: captureRowAllocateWhen('sgrAStar'),
      layers: 6,
      // `size` is a live setting (the DebugPanel resolution knob,
      // 256/512/1024/2048) — `reconcile` resolves it every frame, so dragging
      // the knob reallocates this row (and its cube/layer views) without a
      // rebuild path of its own.
      fixedSizePx: { size: (state) => state.settings.blackHoleLensingTuning.cubemapResolutionPx },
    },
  ],
  slabs: BLACK_HOLES.map(blackHoleSlabRow),
  create,
  destroy,
  passes: (runtime) => [blackHoleLensingPass(runtime)],
  ui: [{ slot: 'debug', content: SgrAStarLensingTuningSectionContainer }],
});
