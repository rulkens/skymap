/**
 * FOREGROUND_MAX_DISTANCE_MPC — the shared camera-distance gate for every
 * NEAR0 foreground layer (`earthLayer`, `starSpheresLayer`, `planetsLayer`,
 * `starPointsLayer`, `orbitTrailsLayer`, `foregroundLabelsLayer`).
 *
 * ### Why a gate at all
 *
 * Above this distance every foreground element — the true-scale bodies, the
 * orbit rings, the local-star point backdrop — is sub-pixel or behind the
 * camera, so the four NEAR0 encoder steps (`(hdr, NEAR0)` render,
 * `(foreground:0, NEAR0)` render, the `foreground:0→swap` composite, and the
 * `(swap, NEAR0)` caption step) are pure per-frame overhead at galaxy /
 * cosmic zoom. `executeFrame` already skips a render step whose enabled-layer
 * group is empty and a composite whose source target went untouched, so
 * ANDing this one predicate into each layer's `enabled` cascades into a
 * wholesale skip for free — no `beginRenderPass`, no star partition, no
 * composite, and no executor change.
 *
 * ### Why DERIVED from SCENE_BODIES, not hand-tuned
 *
 * The gate is `max |positionMpc|` over the seeded bodies times a margin, so
 * moving or adding a body seed carries the gate automatically — the same
 * single-source-of-truth rule the whole `bodies/` folder observes (see
 * `sceneOrbits.ts`, which derives ring radii from the body seeds for exactly
 * this reason). A hand-typed Mpc literal would silently strand a future
 * farther seed outside its own render gate.
 *
 * ### Why the margin is a ×100 enclosure
 *
 * The farthest seed is now Eta Carinae at ~2300 pc ≈ 2.3e-3 Mpc — the roster
 * carries deep stars (Deneb at ~800 pc, Eta Carinae at ~2300 pc) where it once
 * topped out near Pollux at ~10 pc. The gate is that extent times a margin, and
 * the margin resolves two opposed pulls at once:
 *   - ENCLOSE the farthest body with real headroom, so the star-points backdrop
 *     is never cut while the deep neighbourhood is still being framed (the
 *     camera sits a few times the seed extent out while composing the shot). A
 *     ×100 margin keeps the whole foreground alive until the camera is ~230 kpc
 *     out — generous, not a hair above the seed extent.
 *   - Stay well BELOW galaxy scale (< 1 Mpc), so at galaxy / cosmic zoom the
 *     four NEAR0 foreground passes are provably idle — the property the
 *     constant's test pins.
 * ×100 lands the gate at ~0.23 Mpc. That is a coarser gate than the ~1e-2 Mpc
 * the shallow Pollux-era roster produced, because enclosing a ~2.3 kpc
 * neighbourhood with the same backdrop headroom simply reaches further — yet it
 * stays two decades over every body AND comfortably under 1 Mpc, so both hard
 * properties hold. The margin dropped ×10 from the earlier ×1000 to keep the
 * gate under 1 Mpc as the roster's farthest seed grew ~200×.
 *
 * The gate is also the FULL edge of the coupled `surveyDeepZoom` band, so this
 * value has to stay below the Milky-Way "You are here" label's 0.6 Mpc near
 * band (`MILKY_WAY_LABEL_NEAR_MPC`): at ~0.23 Mpc the band reads full before the
 * label's own distance fade does, so the origin-anchored annotation reaches full
 * alpha again as the camera parks in the Local Group — a ×1000 gate (2.3 Mpc)
 * would have dimmed it there.
 */

import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';

// The farthest seeded foreground element from the heliocentric render origin.
// `positionMpc` is authored origin-relative, so |positionMpc| IS the distance.
const FARTHEST_BODY_MPC = Math.max(
  ...SCENE_BODIES.map((body) =>
    Math.hypot(body.positionMpc[0], body.positionMpc[1], body.positionMpc[2]),
  ),
);

// ×100 enclosure headroom over the farthest seed — see the module header's
// margin rationale. Kept small (down from ×1000) now that the roster carries
// deep stars, so the gate stays under 1 Mpc and below the Milky-Way label's
// near band.
const MARGIN = 100;

export const FOREGROUND_MAX_DISTANCE_MPC = FARTHEST_BODY_MPC * MARGIN;
