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
 * ### Why DERIVED from the body snapshot + star records, not hand-tuned
 *
 * The gate is the `max` distance-from-origin over the orbital-body snapshot
 * (`deriveBodyStates(CONST_J2000)` — Earth + planets + moons) and the static
 * `SCENE_STARS` records, times a margin, so moving or adding a seed carries the
 * gate automatically — the same single-source-of-truth rule the whole `bodies/`
 * folder observes (see `sceneOrbits.ts`, which derives ring radii from the body
 * seeds for exactly this reason). A hand-typed Mpc literal would silently strand
 * a future farther seed outside its own render gate.
 *
 * The snapshot is rate-less at prep, and the gate is dominated by the deep
 * static stars — Eta Carinae at ~2300 pc dwarfs Neptune's ~30 AU — so the gate
 * is effectively time-invariant: even once a clock moves the planets, the star
 * that sets the bound does not move, and the ×100 margin swallows the sub-parsec
 * orbital wander regardless.
 *
 * The `FARTHEST_BODY_MPC` extent is exported because it is the ONE derivation
 * source for the whole descent's near-field edges: this gate (×100), the
 * caption gate (`SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC`, ×4), and the star fade
 * bands (`SCALE_FADE_BANDS.starCaption` / `.starBackdrop`) all scale off it, so
 * growing the roster's farthest seed carries every edge in lockstep — no second
 * hand literal to fall out of sync.
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

import { SCENE_STARS } from '../../../data/bodies/sceneStars';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';
import { CONST_J2000 } from '../../../data/time/constJ2000';
import { distanceMpc } from '../../../utils/math/distanceMpc';
import { deriveBodyStates } from './deriveBodyStates';

// The J2000 orbital-body snapshot (Earth + planets + moons), derived ONCE at
// module load — the same construction-time direct-derive `assetWiring` reads.
// The bounds below take each body's distance from the render origin from this
// snapshot rather than a baked record field. The derive is rate-less at prep, so
// at CONST_J2000 it reproduces the bodies' J2000 world positions; the feature
// swaps the epoch for the frame's sim-day once a clock moves them.
const BODY_STATES_J2000 = deriveBodyStates(CONST_J2000);

// Distance from the heliocentric render origin, one per body. Every position is
// authored with the origin at the Sun (`RENDER_ORIGIN_MPC = [0, 0, 0]`), so the
// distance IS the position's magnitude — the orbital bodies come from the
// snapshot, the stars from their own unchanged records.
const ORBITAL_BODY_DISTANCES_MPC = [...BODY_STATES_J2000.values()].map((state) =>
  distanceMpc(RENDER_ORIGIN_MPC, state.positionMpc),
);
const STAR_DISTANCES_MPC = SCENE_STARS.map((star) =>
  distanceMpc(RENDER_ORIGIN_MPC, star.positionMpc),
);

// The farthest seeded foreground element from the render origin — the deep stars
// dominate (Eta Carinae at ~2300 pc), so this bound is set by a static,
// non-orbital seed and stays effectively time-invariant under the clock.
export const FARTHEST_BODY_MPC = Math.max(...ORBITAL_BODY_DISTANCES_MPC, ...STAR_DISTANCES_MPC);

// The farthest orbital-body seed from the heliocentric origin — Neptune at ~30
// AU (~1.5e-10 Mpc). Derived from the same `deriveBodyStates` snapshot as
// `FARTHEST_BODY_MPC`, the same single-source-of-truth way `sceneOrbits.ts`
// derives ring radii: the max over the snapshot, so adding or moving a body seed
// carries this edge in lockstep. The whole snapshot (Earth + planets + moons) is
// scanned rather than filtered because the geocentric moons ride their parent no
// farther than Saturn's ~9.5 AU, comfortably inside Neptune's 30 AU, and Earth
// sits at ~1 AU — so the max lands on Neptune with no need to discriminate body
// kind.
//
// This is the SOLAR-SYSTEM analogue of `FARTHEST_BODY_MPC`: where that scales the
// star-neighbourhood edges (the shared gate, the caption gate, the star fade
// bands), this scales the ONE edge that must key on the solar system's own extent
// — the body-glint far-dissolve band (`SCALE_FADE_BANDS.bodyGlintBackdrop`),
// which fades the sub-pixel planet/moon glints out as the camera pulls back from
// the solar system, so they stop mattering long before Milky-Way framing rather
// than riding full-brightness to the coarse ×100 foreground gate.
export const FARTHEST_PLANET_MPC = Math.max(...ORBITAL_BODY_DISTANCES_MPC);

// ×100 enclosure headroom over the farthest seed — see the module header's
// margin rationale. Kept small (down from ×1000) now that the roster carries
// deep stars, so the gate stays under 1 Mpc and below the Milky-Way label's
// near band.
const MARGIN = 100;

export const FOREGROUND_MAX_DISTANCE_MPC = FARTHEST_BODY_MPC * MARGIN;
