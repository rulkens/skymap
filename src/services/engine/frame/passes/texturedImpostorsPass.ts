/**
 * texturedImpostorsPass — LOD-2 textured galaxy impostors.
 *
 * Two draw calls in the same render pass — quads first, then disks.
 * The legacy `thumbnailSubsystem.runFrame` dispatched in this exact
 * order (thumbnailSubsystem.ts:955-967), and although additive blending
 * makes the cosmetic order irrelevant for correctness, the visual
 * baseline test pins it.
 *
 * Both arrays come from `state.subsystems.texturedImpostors.lastOutput`,
 * populated by the subsystem's `runFrame` earlier in the same frame.
 * See `proceduralDisksPass.ts`'s docstring for the rationale on the
 * lastOutput pattern.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const texturedImpostorsPass: Pass = {
  name: 'textured-impostors',
  enabled(state, _ctx, settings) {
    if (!settings.galaxyTexturesEnabled) return false;
    if (state.subsystems.texturedImpostors === null) return false;
    const { disks, quads } = state.subsystems.texturedImpostors.lastOutput;
    return disks.length > 0 || quads.length > 0;
  },
  draw(pass, ctx, state, _settings, deps) {
    const subsys = state.subsystems.texturedImpostors;
    if (subsys === null) return;
    const { disks, quads } = subsys.lastOutput;
    if (quads.length > 0) {
      // PassDeps.texturedQuadRenderer holds a TexturedQuadRenderer — the
      // field name tracks the type name post-rename (Task 3).
      deps.texturedQuadRenderer.draw(
        pass,
        ctx.vp,
        [ctx.canvasSize.width, ctx.canvasSize.height],
        quads,
        ctx.drawCamPos,
        ctx.drawPxPerRad,
      );
    }
    if (disks.length > 0) {
      deps.texturedDiskRenderer.draw(
        pass,
        ctx.vp,
        [ctx.canvasSize.width, ctx.canvasSize.height],
        ctx.drawCamPos,
        disks,
      );
    }
  },
};
