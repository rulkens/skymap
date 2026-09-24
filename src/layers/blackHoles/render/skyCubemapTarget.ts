/**
 * `sky-cubemap` — the lens's captured environment: 6 layers of a fixed-size
 * 2d-array, bound as a `texture_cube` (see `CubeFace.d.ts`). Same
 * depthless/additive/zero-clear profile as `hdr`: the captured roster is additive.
 * Lazily allocated (1024² × 6 × 8 B is 50 MB, and the lens draws only near
 * Sgr A*). `scheduleSkyCaptures` writes the band flag and reconciles on its
 * edge, so the row exists on the band-entry frame that sweeps all six faces.
 */

import type { RenderTargetSpec } from '../../../@types/engine/frame/RenderTargetSpec';
import { HDR_TARGET_FORMAT } from '../../../data/renderTargetFormats';
import { captureRowAllocateWhen } from '../../../utils/gpu/captureRowAllocateWhen';

export const SKY_CUBEMAP_TARGET: RenderTargetSpec = {
  id: 'sky-cubemap',
  format: HDR_TARGET_FORMAT,
  depth: null,
  scale: 1, // unused: fixedSizePx overrides it (required by the type).
  clearValue: { r: 0, g: 0, b: 0, a: 0 },
  allocateWhen: captureRowAllocateWhen('sgrAStar'),
  layers: 6,
  // A live setting (the DebugPanel resolution knob): `reconcile` resolves it
  // every frame, so dragging the knob reallocates this row and its views.
  fixedSizePx: { size: (state) => state.settings.blackHoleLensingTuning.cubemapResolutionPx },
};
