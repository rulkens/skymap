/**
 * texturedDisksLayer — LOD-2 textured galaxy thumbnails (3D-oriented disks).
 *
 * Reads `state.settings.thumbnails.enabled` as the master gate, then
 * `state.subsystems.texturedDisks.lastOutput.disks` (populated upstream
 * in `runFrame.ts`), and dispatches one draw call to
 * `state.gpu.texturedDiskRenderer`.  The legacy screen-aligned quad
 * fallback was deleted because the build pipeline's deterministic
 * orientation fallback (`buildAllBins.ts`) ensures every encoded galaxy
 * has finite (axisRatio, PA) — see `texturedDiskSubsystem.ts` for the
 * full rationale.
 *
 * `state.gpu.texturedDiskRenderer` is nullable pre-bootstrap (like every
 * GPU handle on `state.gpu`); `enabled` doesn't check it, so `draw` guards
 * defensively — same pattern as `filamentsLayer.draw`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';

export const texturedDisksLayer: ContentLayer = {
  name: 'textured-disks',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, _ctx, _view) {
    if (!state.settings.thumbnails.enabled) return false;
    if (state.subsystems.texturedDisks === null) return false;
    return state.subsystems.texturedDisks.lastOutput.disks.length > 0;
  },
  draw(pass, view, _ctx, state) {
    const subsys = state.subsystems.texturedDisks;
    if (subsys === null) return;
    const { disks } = subsys.lastOutput;
    if (disks.length === 0) return;
    if (state.gpu.texturedDiskRenderer === null) return;
    state.gpu.texturedDiskRenderer.draw(
      pass,
      view.vp,
      view.viewportPx,
      view.camPos,
      state.gpu.focusUniform!.bindGroup,
      disks,
    );
  },
};
