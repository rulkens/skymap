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
 * ### Why the margin is generous (×1000)
 *
 * The farthest seed is Pollux at ~10.34 pc ≈ 1.03e-5 Mpc, so the gate lands
 * at ~1e-2 Mpc (~10 kpc). Three properties motivate that decade:
 *   - `starPointsLayer` draws a fixed-size local starfield backdrop; the gate
 *     must not cut the points while the ~10 pc neighbourhood is still being
 *     framed (camera within a few hundred parsecs), so a tight bound over the
 *     seed extent would pop the backdrop mid-shot.
 *   - It stays a decade ABOVE the caption gate
 *     (`SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`, 1 kpc), preserving the intended
 *     order: the bodies/backdrop appear first on descent, the captions later.
 *   - It stays two decades BELOW 1 Mpc, so at galaxy scale the foreground
 *     passes are provably idle — the property the constant's test pins.
 */

import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';

// The farthest seeded foreground element from the heliocentric render origin.
// `positionMpc` is authored origin-relative, so |positionMpc| IS the distance.
const FARTHEST_BODY_MPC = Math.max(
  ...SCENE_BODIES.map((body) =>
    Math.hypot(body.positionMpc[0], body.positionMpc[1], body.positionMpc[2]),
  ),
);

// Generous on purpose — see the module header's margin rationale.
const MARGIN = 1000;

export const FOREGROUND_MAX_DISTANCE_MPC = FARTHEST_BODY_MPC * MARGIN;
