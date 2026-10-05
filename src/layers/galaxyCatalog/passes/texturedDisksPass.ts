/**
 * texturedDisksPass — LOD-2 textured galaxy thumbnails (3D-oriented disks), from
 * the disks the shared planner walk left on the subsystem earlier this frame.
 * In the sky-capture roster (Ruling 6): without it the black-hole lens quad
 * covered the real textured LMC/SMC/M31 with a cubemap that never had them.
 */

import type { ContentPass } from '../../../@types/engine/frame/ContentPass';
import type { GalaxyCatalogRuntime } from '../@types/GalaxyCatalogRuntime';

export function texturedDisksPass(runtime: GalaxyCatalogRuntime): ContentPass {
  return {
    name: 'textured-disks',

    enabled(state) {
      if (!state.settings.thumbnails.enabled) return false;
      return runtime.texturedDisks.lastOutput.disks.length > 0;
    },

    draw(pass, view, ctx, state) {
      // Capture-safe: `disks` was computed ONCE this frame from the REAL
      // camera, upstream of the capture sweep, so a capture face's per-face ctx
      // can never cull a galaxy the real observer's gates already admitted.
      const { disks } = runtime.texturedDisks.lastOutput;
      if (disks.length === 0) return;
      runtime.texturedDiskRenderer.draw(
        pass,
        view.vp,
        view.viewportPx,
        ctx.drawPxPerRad,
        view.camPos,
        state.gpu.focusUniform!.bindGroup,
        disks,
        // Each call's `@group(0)` camera uniform needs its own physical buffer
        // (`instancedQuadRenderer`'s ring) — the instance buffer needs no ring,
        // every call this frame re-uploads the same byte-identical `disks`.
        ctx.viewSlot,
      );
    },
  };
}
