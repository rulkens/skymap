/**
 * horizonShellLayer — translucent sphere at the comoving particle-
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
 * point cloud's.  `horizonShellFadeAlpha` (see `utils/math/horizonShellFadeAlpha`)
 * returns 0 while the camera is close enough to be studying individual
 * galaxies and smoothsteps to 1 once it pulls back to a meaningful
 * fraction of the 14.3-Gpc shell radius.  The gate lives in `enabled`
 * (not just as a shader alpha) so a faded-out shell skips its
 * `beginRenderPass` entirely — a full-screen ray-march fragment shader
 * is not free to run for an all-transparent result, and an idle layer
 * would also burn a GPU-timings slot.  The same alpha is recomputed in
 * `draw` and handed to the renderer; both reads use the frame-frozen
 * `ctx.drawCamPos`, so they agree.
 *
 * ### Why drawn after `volume-upsample` and before `structure-markers`
 *
 * The shell is a background contributor — drawing it after the volume
 * layers means the cosmic-web densities composite over it cleanly,
 * and drawing it before cluster markers means the marker rings
 * still pop on top.
 *
 * ### Why `ctx.cam`, not `view.vp`
 *
 * `HorizonShellRenderer.draw` derives its own camera basis + FOV from the
 * live `OrbitCamera` (it intersects per-pixel view rays with the shell
 * sphere analytically, rather than transforming vertices through a
 * view-projection matrix), so it needs the camera object itself, not a
 * `SlabView`'s resolved `vp`.  `view.viewportPx` is still the right
 * viewport source, since that's the same value `slabViewOf` derives from
 * `ctx.canvasSize`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { horizonShellFadeAlpha } from '../../../../utils/math/horizonShellFadeAlpha';
import { HORIZON_RADIUS_GPC } from '../../../gpu/renderers/horizonShell/horizonShellRenderer';

/** Shell radius in Mpc — the fade band is a fraction of this. */
const HORIZON_RADIUS_MPC = HORIZON_RADIUS_GPC * 1000;

export const horizonShellLayer: ContentLayer = {
  name: 'horizon-shell',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(_state, ctx, _view) {
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return horizonShellFadeAlpha(camDistMpc, HORIZON_RADIUS_MPC) > 0;
  },

  draw(pass, view, ctx, state) {
    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const fadeAlpha = horizonShellFadeAlpha(camDistMpc, HORIZON_RADIUS_MPC);
    if (state.gpu.horizonShellRenderer === null) return;
    state.gpu.horizonShellRenderer.draw(pass, ctx.cam, view.viewportPx, fadeAlpha);
  },
};
