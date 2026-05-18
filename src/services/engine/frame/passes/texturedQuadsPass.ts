/**
 * texturedQuadsPass — LOD-2 textured galaxy thumbnails (screen-aligned).
 *
 * Half of the former `texturedImpostorsPass` split (2026-05-18) so the
 * debug panel can toggle the screen-aligned thumbnail quads
 * independently from their 3D-oriented disk siblings.  Both halves read
 * the same upstream subsystem output
 * (`state.subsystems.texturedImpostors.lastOutput`) — only the renderer
 * dispatch differs.
 *
 * Draw order is preserved: this pass runs BEFORE `texturedDisksPass`
 * inside `HDR_PASSES`, matching the legacy
 * `thumbnailSubsystem.runFrame` dispatch order (quads first, disks
 * second).  Additive blending makes the cosmetic order irrelevant for
 * correctness, but the visual baseline test still pins it.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const texturedQuadsPass: Pass = {
  name: 'textured-quads',
  enabled(state, _ctx, settings) {
    if (!settings.galaxyTexturesEnabled) return false;
    if (state.subsystems.texturedImpostors === null) return false;
    return state.subsystems.texturedImpostors.lastOutput.quads.length > 0;
  },
  draw(pass, ctx, state, _settings, deps) {
    const subsys = state.subsystems.texturedImpostors;
    if (subsys === null) return;
    const { quads } = subsys.lastOutput;
    if (quads.length === 0) return;
    deps.texturedQuadRenderer.draw(
      pass,
      ctx.vp,
      [ctx.canvasSize.width, ctx.canvasSize.height],
      quads,
      ctx.drawCamPos,
      ctx.drawPxPerRad,
    );
  },
};
