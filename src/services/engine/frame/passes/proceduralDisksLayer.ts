/**
 * proceduralDisksLayer — LOD-1 procedural disk impostors.
 *
 * Reads `state.settings.thumbnails.enabled` as the master gate, then
 * `state.subsystems.proceduralDisks.lastOutput.instances` (populated by
 * the shared `diskPlannerWalk` driving this subsystem's visitor earlier in
 * the same frame, called from `runFrame.ts` before the render-step loop
 * opens), and issues one draw call against `state.gpu.proceduralDiskRenderer`.
 *
 * ### Why read from lastOutput instead of running the planner here
 *
 * The legacy `galaxyThumbnailsPass.draw` called `thumbnails.runFrame(...)`
 * inline, conflating "compute the per-frame state" with "issue GPU draw
 * calls".  Post-split, the planner step is hoisted to the frame body
 * (one place that calls every CPU-side subsystem) and each layer file
 * stays purely a GPU dispatch.  This decoupling is what makes the
 * follow-up GPU timestamp-query work cheap — each layer can open its
 * own encoder without re-running its planner.
 *
 * ### Why the renderer-null guard
 *
 * `state.gpu.proceduralDiskRenderer` is nullable pre-bootstrap (like every
 * GPU handle on `state.gpu`); `enabled` doesn't check it (it only gates on
 * settings + pending instances), so `draw` guards defensively — same
 * pattern as `filamentsLayer.draw`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';

export const proceduralDisksLayer: ContentLayer = {
  name: 'procedural-disks',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, _ctx, _view) {
    if (!state.settings.thumbnails.enabled) return false;
    if (state.subsystems.proceduralDisks === null) return false;
    return state.subsystems.proceduralDisks.lastOutput.instances.length > 0;
  },
  draw(pass, view, ctx, state) {
    const subsys = state.subsystems.proceduralDisks;
    if (subsys === null) return;
    if (state.gpu.proceduralDiskRenderer === null) return;
    const instances = subsys.lastOutput.instances;
    state.gpu.proceduralDiskRenderer.draw(
      pass,
      view.vp,
      view.viewportPx,
      view.camPos,
      ctx.drawPxPerRad,
      state.gpu.focusUniform!.bindGroup,
      instances,
    );
  },

  // Pick aspect — replays the retained disk instances (the last-drawn LOD
  // set, held inside the renderer) through the r32uint pick pipeline. Only
  // the CAMERA is caller-supplied (from the resolved SlabView), so the pick
  // uniform reflects the frame being picked, never a stale draw()-time
  // stash — the content replay is the renderer's own concern. Same
  // renderer-null guard as `draw`: the GPU handle is nullable pre-bootstrap
  // and the pick program's `enabled` gate never narrows it.
  //
  // ### @group(0) prefix restore
  //
  // `pickDisks` binds the disk camera at `@group(0)`, clobbering the shared
  // point-pick camera prefix that the structure-marker row drawn after this
  // one reads (it binds nothing at slot 0 itself). So this row calls
  // `galaxyPickRenderer.bindCamera(pass)` before returning to put the shared
  // prefix back — the postcondition every COSMO `drawPick` owes its
  // successors (see `ContentLayer.drawPick`). Null-guarded like the disk
  // renderer.
  drawPick(pass, view, ctx, state) {
    if (state.gpu.proceduralDiskRenderer === null) return;
    state.gpu.proceduralDiskRenderer.pickDisks(
      pass,
      view.vp,
      view.viewportPx,
      view.camPos,
      ctx.drawPxPerRad,
      state.gpu.focusUniform!.bindGroup,
    );
    state.gpu.galaxyPickRenderer?.bindCamera(pass);
  },
};
