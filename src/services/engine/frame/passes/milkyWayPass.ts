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
 * Gated on `settings.milkyWayEnabled` (user toggle).  Once enabled,
 * the pass also performs an *internal* alpha-fade gate inside
 * `draw`: when the camera sits beyond the outer edge of the fade
 * band defined in `utils/math/milkyWayFade.ts`, `fadeAlpha` is 0
 * and the draw call is skipped.  We keep the alpha-fade check
 * inside `draw` (rather than promoting it to `enabled`) for two
 * reasons:
 *
 *   1. `milkyWayFadeAlpha` is a tiny pure function — calling it
 *      from `enabled` and `draw` would double the call cost and
 *      open a window for the camera to move between the gate read
 *      and the draw read.  Computing it once and acting on the
 *      result keeps the read coherent.
 *   2. The "user enabled but camera too far" case is a minor
 *      optimisation, not a semantic difference.  Keeping `enabled`
 *      tied to the user-facing toggle makes the gate read the same
 *      way every test and debug-print does ("did the user turn
 *      this on?").
 *
 * ### What it reads
 *
 * - `deps.milkyWayRenderer`
 * - `deps.milkyWayITimeSec` — animation clock for the raymarcher
 * - `ctx.vp`, `ctx.canvasSize`, `ctx.drawCamPos`
 * - `settings.milkyWayEnabled` (via the gate)
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

import type { Pass } from './types';
import { milkyWayFadeAlpha } from '../../../../utils/math/milkyWayFade';
import { MILKY_WAY_CENTER_WORLD } from '../../../../data/galacticCenter';

export const milkyWayPass: Pass = {
  name: 'milky-way',

  enabled(_state, _ctx, settings) {
    return settings.milkyWayEnabled;
  },

  draw(pass, ctx, _state, _settings, deps) {
    const { vp, canvasSize, drawCamPos } = ctx;
    const camDistMpc = Math.hypot(drawCamPos[0], drawCamPos[1], drawCamPos[2]);
    const fadeAlpha = milkyWayFadeAlpha(camDistMpc);

    // Internal fade-out: the user's toggle is on but the camera is
    // beyond the fade band.  Skip the draw cleanly — see module
    // header for why the alpha gate stays inside `draw` rather than
    // moving up to `enabled`.
    if (fadeAlpha <= 0) return;

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
