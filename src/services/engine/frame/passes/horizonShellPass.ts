/**
 * horizonShellPass — translucent sphere at the comoving particle-
 * horizon distance, marking the edge of the observable universe.
 *
 * ### What it draws
 *
 * A static UV-sphere mesh centred at the world origin with a Fresnel-
 * rim fragment shader, so the silhouette reads as a soft glowing
 * shell.  The shell radius is fixed at construction time (see
 * `HORIZON_RADIUS_MPC` in `horizonShellRenderer.ts`); only the
 * per-frame camera pose updates the uniform block.
 *
 * ### When it draws
 *
 * Gated by a camera-distance fade — the mirror image of the Milky-Way
 * impostor's.  `horizonShellFadeAlpha` (see `utils/math/horizonShellFade`)
 * returns 0 while the camera is close enough to be studying individual
 * galaxies and smoothsteps to 1 once it pulls back to a meaningful
 * fraction of the 14.3-Gpc shell radius.  The gate lives in `enabled`
 * (not just as a shader alpha) so a faded-out shell skips its
 * `beginRenderPass` entirely — a full-screen ray-march fragment shader
 * is not free to run for an all-transparent result, and an idle pass
 * would also burn a GPU-timings slot.  The same alpha is recomputed in
 * `draw` and handed to the renderer; both reads use the frame-frozen
 * `ctx.drawCamPos`, so they agree.
 *
 * ### Why drawn after `volume-upsample` and before `structure-markers`
 *
 * The shell is a background contributor — drawing it after the volume
 * passes means the cosmic-web densities composite over it cleanly,
 * and drawing it before cluster markers means the marker rings
 * still pop on top.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { horizonShellFadeAlpha } from '../../../../utils/math/horizonShellFade';
import { HORIZON_RADIUS_GPC } from '../../../gpu/renderers/horizonShellRenderer';

/** Shell radius in Mpc — the fade band is a fraction of this. */
const HORIZON_RADIUS_MPC = HORIZON_RADIUS_GPC * 1000;

export const horizonShellPass: Pass = {
  name: 'horizon-shell',

  enabled(_state, ctx) {
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return horizonShellFadeAlpha(camDistMpc, HORIZON_RADIUS_MPC) > 0;
  },

  draw(pass, ctx, _state, _settings, deps) {
    const { cam, canvasSize, drawCamPos } = ctx;
    const camDistMpc = Math.hypot(drawCamPos[0], drawCamPos[1], drawCamPos[2]);
    const fadeAlpha = horizonShellFadeAlpha(camDistMpc, HORIZON_RADIUS_MPC);
    deps.horizonShellRenderer.draw(pass, cam, [canvasSize.width, canvasSize.height], fadeAlpha);
  },
};
