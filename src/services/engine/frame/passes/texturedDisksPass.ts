/**
 * texturedDisksPass — LOD-2 textured galaxy thumbnails (3D-oriented disks).
 *
 * What's left of the former `texturedDisksPass` after the
 * 2026-05-18 quad-removal.  Reads from
 * `state.subsystems.texturedDisks.lastOutput.disks` (populated
 * upstream in `runFrame.ts`) and dispatches one draw call to
 * `texturedDiskRenderer`.  The legacy screen-aligned quad fallback
 * was deleted because the build pipeline's deterministic orientation
 * fallback (`buildAllBins.ts`) ensures every encoded galaxy has finite
 * (axisRatio, PA) — see `texturedDiskSubsystem.ts` for the full
 * rationale.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const texturedDisksPass: Pass = {
  name: 'textured-disks',
  enabled(state, _ctx, settings) {
    if (!settings.galaxyTexturesEnabled) return false;
    if (state.subsystems.texturedDisks === null) return false;
    return state.subsystems.texturedDisks.lastOutput.disks.length > 0;
  },
  draw(pass, ctx, state, _settings, deps) {
    const subsys = state.subsystems.texturedDisks;
    if (subsys === null) return;
    const { disks } = subsys.lastOutput;
    if (disks.length === 0) return;
    deps.texturedDiskRenderer.draw(
      pass,
      ctx.vp,
      [ctx.canvasSize.width, ctx.canvasSize.height],
      ctx.drawCamPos,
      disks,
    );
  },
};
