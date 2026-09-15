/**
 * proceduralDisksPass — LOD-1 procedural disk impostors. Reads
 * `settings.thumbnails.enabled` as the master gate, then the instances the
 * shared `diskPlannerWalk` left on the planner earlier this frame (the Layer's
 * `frame` hook runs before any pass opens), and issues one draw call. Planning
 * and drawing stay split so each pass can open its own timed encoder.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { GalaxyCatalogRuntime } from '../types/GalaxyCatalogRuntime';

export function proceduralDisksPass(runtime: GalaxyCatalogRuntime): ContentPass {
  return {
    name: 'procedural-disks',

    enabled(state) {
      if (!state.settings.thumbnails.enabled) return false;
      return runtime.proceduralDisks.lastOutput.instances.length > 0;
    },

    draw(pass, view, ctx, state) {
      runtime.proceduralDiskRenderer.draw(
        pass,
        view.vp,
        view.viewportPx,
        view.camPos,
        ctx.drawPxPerRad,
        state.gpu.focusUniform!.bindGroup,
        runtime.proceduralDisks.lastOutput.instances,
      );
    },

    // Pick aspect — replays the retained disk instances (the last-drawn LOD set,
    // held inside the renderer) through the r32uint pick pipeline. Only the
    // CAMERA is caller-supplied (from the resolved SlabView), so the pick uniform
    // reflects the frame being picked, never a stale draw()-time stash.
    drawPick(pass, view, ctx, state) {
      runtime.proceduralDiskRenderer.pickDisks(
        pass,
        view.vp,
        view.viewportPx,
        view.camPos,
        ctx.drawPxPerRad,
        state.gpu.focusUniform!.bindGroup,
      );
    },
  };
}
