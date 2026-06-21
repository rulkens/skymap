/**
 * milkyWayPass — procedural Milky Way impostor at the world origin.
 *
 * ### What it draws
 *
 * A view-aligned billboard centred on the world origin (the Milky
 * Way's adopted barycentre in catalogue coordinates) carrying a
 * full-screen procedural raymarched spiral.  Both vertex and
 * fragment stages consume the live world-space camera position so
 * the synthetic vantage rotates with the user's orbit instead of
 * presenting the same hard-coded view every frame.
 *
 * ### When it draws
 *
 * Two gates, both in `enabled`:
 *
 *   1. `state.settings.milkyWay.enabled` — user toggle.
 *   2. `milkyWayFadeAlpha(camDist) > 0` — camera-distance fade band
 *      defined in `utils/math/milkyWayFadeAlpha.ts` (full strength inside
 *      10 Mpc, smoothstep out to 0 at 50 Mpc).
 *
 * Both gates live in `enabled` so that when the camera flies well
 * beyond the local volume the whole pass is skipped — no
 * `beginRenderPass`, no tile-RAM round-trip on M1, and no idle
 * timestamp slot in the GPU-timings panel.  `milkyWayFadeAlpha` is
 * called again inside `draw` to compute the actual alpha to send to
 * the shader; both reads use the frame-frozen `ctx.drawCamPos`, so
 * they return the same value (no race).
 *
 * ### What it reads
 *
 * - `deps.milkyWayRenderer`
 * - `deps.milkyWayITimeSec` — animation clock for the raymarcher
 * - `ctx.vp`, `ctx.canvasSize`, `ctx.drawCamPos`
 * - `state.settings.milkyWay.enabled` (user toggle, via the gate)
 *
 * ### Why drawn LAST inside the HDR pass
 *
 * Same rationale as the pre-D.2 inline ordering: additive blending
 * makes per-fragment colour mathematically commutative, but the
 * deterministic record points → thumbnails → filaments → milky-way
 * keeps the encoder bit-stable across HMR reloads and matches the
 * conceptual layering "background catalogue → cluster overlays →
 * local-universe skeleton → bright foreground feature".
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { milkyWayFadeAlpha } from '../../../../utils/math/milkyWayFadeAlpha';
import { MILKY_WAY_CENTER_WORLD } from '../../../../data/milkyWay/galacticCenter';

export const milkyWayPass: Pass = {
  name: 'milky-way',

  enabled(state, ctx) {
    // State boolean is the user's intent; opacityOf > 0 keeps the
    // pass alive through the ~100 ms toggle fade-out tail. The
    // distance-based milkyWayFadeAlpha still gates separately — if
    // the camera is too far away from the Milky Way to render it,
    // skip even when the toggle is on.
    const togglePart =
      state.settings.milkyWay.enabled ||
      state.subsystems.fades.opacityOf({ kind: 'milkyWay' }, performance.now()) > 0;
    if (!togglePart) return false;
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    return milkyWayFadeAlpha(camDistMpc) > 0;
  },

  draw(pass, ctx, state, deps) {
    const { vp, canvasSize, drawCamPos } = ctx;
    const camDistMpc = Math.hypot(drawCamPos[0], drawCamPos[1], drawCamPos[2]);
    // Composite the distance-based fade with the registry-supplied
    // toggle opacity. The renderer already accepts a scalar fadeAlpha
    // CPU-side param, so multiplying two opacities here is the
    // minimal-change path — no shader edits, no FadeUniforms binding.
    const toggleOpacity = state.subsystems.fades.opacityOf(
      { kind: 'milkyWay' },
      performance.now(),
    );
    const fadeAlpha = milkyWayFadeAlpha(camDistMpc) * toggleOpacity;

    deps.milkyWayRenderer.draw(
      pass,
      vp as Float32Array,
      [canvasSize.width, canvasSize.height],
      fadeAlpha,
      deps.milkyWayITimeSec,
      // World-space camera position drives both the impostor's
      // view-aligned billboard basis (vertex stage) and the
      // fragment stage's synthetic-camera ray origin.
      [drawCamPos[0], drawCamPos[1], drawCamPos[2]],
      // The catalog data origin is the OBSERVER (Earth/Sun), so the
      // Milky Way's actual center sits ~8 kpc from there in the
      // direction of Sgr A\*.  Anchoring the impostor at that offset
      // gives the astronomically correct relationship between the
      // observer and the galaxy at close zoom.  See
      // `data/galacticCenter.ts` for the constant's derivation.
      [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
    );
  },
};
