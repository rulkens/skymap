/**
 * proceduralDisksPass — LOD-1 procedural disk impostors.
 *
 * Issues a single draw call against `proceduralDiskRenderer` using the
 * instance array `state.subsystems.proceduralDisks.lastOutput.instances`,
 * populated by the subsystem's `runFrame` earlier in the same frame
 * (called from `runFrame.ts` before the HDR_PASSES loop opens).
 *
 * ### Why read from lastOutput instead of running the planner here
 *
 * The legacy `galaxyThumbnailsPass.draw` called `thumbnails.runFrame(...)`
 * inline, conflating "compute the per-frame state" with "issue GPU draw
 * calls".  Post-split, the planner step is hoisted to the frame body
 * (one place that calls every CPU-side subsystem) and each pass file
 * stays purely a GPU dispatch.  This decoupling is what makes the
 * follow-up GPU timestamp-query work cheap — each pass can open its
 * own encoder without re-running its planner.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const proceduralDisksPass: Pass = {
  name: 'procedural-disks',
  enabled(state, _ctx, settings) {
    if (!settings.galaxyTexturesEnabled) return false;
    if (state.subsystems.proceduralDisks === null) return false;
    return state.subsystems.proceduralDisks.lastOutput.instances.length > 0;
  },
  draw(pass, ctx, state, _settings, deps) {
    const subsys = state.subsystems.proceduralDisks;
    if (subsys === null) return;
    const instances = subsys.lastOutput.instances;
    deps.proceduralDiskRenderer.draw(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
      [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
      ctx.drawPxPerRad,
      state.gpu.focusUniform!.bindGroup,
      instances,
    );
  },
};
