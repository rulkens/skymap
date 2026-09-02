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
 *
 * ### Sky-cubemap capture roster (Task 13b, Ruling 6)
 *
 * The textured famous-galaxy thumbnails (LMC/SMC/M31 at close approach) are
 * part of the black-hole lens's captured "sky" — without this flag the
 * cubemap lacked them, so the lens quad covered the real, textured originals
 * with a capture that never had them in the first place. Draw-safe against a
 * synthetic per-face ctx: `disks` is computed ONCE per frame from the REAL
 * camera, upstream of the capture sweep (`diskPlannerWalk.runFrame`, before
 * `renderFrame`/`executeFrame` run) — so a capture face's synthetic ctx can
 * never cull a galaxy the real observer's apparent-size/distance gates
 * already admitted, and `disks` is the same list for every draw() call this
 * frame. `ctx.viewSlot` forwards to `texturedDiskRenderer.draw` so each
 * call's `@group(0)` camera uniform lands in its own physical buffer
 * (`instancedQuadRenderer.ts`'s `viewSlotCount` ring) instead of racing on a
 * shared one — the instance buffer itself needs no such ring, since every
 * call this frame re-uploads the same byte-identical `disks` list.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';

export const texturedDisksLayer: ContentLayer = {
  name: 'textured-disks',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',
  skyCapture: true,

  enabled(state, _ctx, _view) {
    if (!state.settings.thumbnails.enabled) return false;
    if (state.subsystems.texturedDisks === null) return false;
    return state.subsystems.texturedDisks.lastOutput.disks.length > 0;
  },
  draw(pass, view, ctx, state) {
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
      ctx.viewSlot,
    );
  },
};
