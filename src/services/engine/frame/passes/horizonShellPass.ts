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
 * Always.  No user toggle, no distance gate.  The Fresnel falloff
 * naturally makes the shell invisible from very close to the
 * origin (the silhouette curves away from any line of sight that
 * doesn't reach near-tangent to the sphere), so the visual cost at
 * close zoom is also nil.
 *
 * ### Why drawn after `volume-upsample` and before `cluster-markers`
 *
 * The shell is a background contributor — drawing it after the volume
 * passes means the cosmic-web densities composite over it cleanly,
 * and drawing it before cluster markers means the marker rings
 * still pop on top.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const horizonShellPass: Pass = {
  name: 'horizon-shell',

  enabled() {
    return true;
  },

  draw(pass, ctx, _state, _settings, deps) {
    const { cam, canvasSize } = ctx;
    deps.horizonShellRenderer.draw(pass, cam, [canvasSize.width, canvasSize.height]);
  },
};
