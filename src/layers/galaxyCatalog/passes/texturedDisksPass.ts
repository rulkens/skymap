/**
 * texturedDisksPass — LOD-2 textured galaxy thumbnails (3D-oriented disks), from
 * the disks the shared planner walk left on the subsystem earlier this frame.
 *
 * ### Sky-cubemap capture roster (Task 13b, Ruling 6)
 *
 * The textured famous-galaxy thumbnails (LMC/SMC/M31 at close approach) are
 * part of the black-hole lens's captured "sky" — without this flag the cubemap
 * lacked them, so the lens quad covered the real, textured originals with a
 * capture that never had them. Draw-safe against a synthetic per-face ctx:
 * `disks` is computed ONCE per frame from the REAL camera, upstream of the
 * capture sweep, so a capture face's synthetic ctx can never cull a galaxy the
 * real observer's gates already admitted. `ctx.viewSlot` forwards to the
 * renderer so each call's `@group(0)` camera uniform lands in its own physical
 * buffer (`instancedQuadRenderer.ts`'s `viewSlotCount` ring) instead of racing
 * on a shared one — the instance buffer needs no such ring, since every call
 * this frame re-uploads the same byte-identical `disks` list.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { GalaxyCatalogRuntime } from '../types/GalaxyCatalogRuntime';

export function texturedDisksPass(runtime: GalaxyCatalogRuntime): ContentPass {
  return {
    name: 'textured-disks',

    enabled(state) {
      if (!state.settings.thumbnails.enabled) return false;
      return runtime.texturedDisks.lastOutput.disks.length > 0;
    },

    draw(pass, view, ctx, state) {
      const { disks } = runtime.texturedDisks.lastOutput;
      if (disks.length === 0) return;
      runtime.texturedDiskRenderer.draw(
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
}
