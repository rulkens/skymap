/**
 * atmosphereShellPass — Earth's (and any seeded planet's) physically-based
 * in-scatter atmosphere as a `'body'`-slab content row, drawn into the
 * depth-bearing `foreground:0` target (spec §8.3). A translucent proxy sphere
 * scaled to the atmosphere-TOP radius, sitting just outside the cloud shell.
 *
 * ### What it draws — the blue limb, reddened terminator, and over-disc haze
 *
 * The frame program expands a `'body'` layer into one render step per body-m
 * slab row (Task 7); `enabled`/`draw` are therefore called once PER BODY,
 * gated on `view.slab.frame.bodyId` rather than looping over every atmosphere
 * body internally. The renderer's shell pipeline draws BOTH walls (no cull)
 * and the fragment splits duty by facing: the NEAR wall carries the over-disc
 * aerial perspective (haze on the lit disc), the FAR wall the limb + sky.
 * Depth-testing each wall against the already-stamped opaque scene keeps
 * cross-body occlusion for both. The fragment samples this frame's sky-view
 * LUT (baked by the `atmosphereSkyView` compute step, in the compute prelude)
 * to compose the in-scattered radiance: a blue limb over the day side, a
 * reddened arc along the terminator/sunset, and haze greying the disc with
 * distance. Per-pixel scene-depth-aware aerial perspective on down-view/
 * ground rays (haze between the camera and terrain while inside the shell) is
 * the deferred froxel upgrade, tracked as its own backlog item.
 *
 * On the entry's `inside` the layer switches to a full-screen covering-triangle
 * pipeline pair instead — no wall split, `depthCompare: 'always'`, the ray
 * reconstructed per-fragment from `invMvp` via a homogeneous unproject (see
 * `shell/fragment.wesl`'s `insideRayDir`).
 *
 * ### Why it draws LAST, OVER not opaque (spec §8.3)
 *
 * The atmosphere is the outermost translucent member of the `(foreground:0,
 * 'body')` group — ordered after the opaque spheres, the rings, AND Earth's
 * cloud shell in `FRAME_ORDER`'s `bodyPasses` (the authored list
 * `expandFrameOrder` resolves in order; `CONTENT_PASSES` is a registry, not an
 * order), so it draws once every opaque sphere has stamped its depth. The one
 * row AFTER it is `mesh-bodies`, which the inside path cannot see — that
 * ordering and its cost are argued at the `bodyPasses` line itself. Its
 * pipeline depth-TESTS against them
 * (`depthCompare: 'greater-equal'`, the body-m slab's reversed-Z convention —
 * clear `0.0`, greater-z-wins; the EQUAL half lets the shell hugging a body's
 * own surface still pass against the depth that surface stamped) but writes
 * NO depth. The shell draws its geometry TWICE — MULTIPLY for per-channel
 * extinction, then ADD for the in-scatter — because one alpha channel cannot
 * attenuate three wavelengths. It is non-pickable (a translucent halo has no
 * clickable silhouette; clicking Earth hits the opaque surface `earthPass`
 * stamps into the pick pass), so it declares no `drawPick`.
 *
 * ### Which bodies draw this frame
 *
 * `enabled` and `draw` both consult `atmosphereDrawList` — the ONE per-frame
 * derivation of which seeded bodies have a live atmosphere (an
 * `ATMOSPHERE_PARAMS` row, inside `FOREGROUND_MAX_DISTANCE_MPC`, above the
 * shared sub-pixel disc cull) — filtered to THIS row's `bodyId`. Because the
 * sky-view bake (`encodeAtmosphereSkyView`) reads the SAME unfiltered list,
 * bake↔draw is equality by construction: a frame can never draw the shell
 * against a LUT it skipped baking. The entry also carries the pose-dependent
 * values (`atmosphereTopM`, `camLocal`, `sunLocal`, `inside`), so the fragment
 * cannot march a camera or a sun the LUT was not baked from —
 * `atmosphereShellUniforms` turns that entry into this row's uniform record,
 * and carries the f64 slab seam with it.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import { atmosphereDrawList } from '../atmosphereDrawList';
import { atmosphereShellUniforms } from '../atmosphereShellUniforms';

export const atmosphereShellPass: ContentPass = {
  name: 'atmosphere-shell',

  enabled(state, ctx, view) {
    if (view.slab.frame.kind !== 'body-m') return false;
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch the body inputs.
    if (state.gpu.atmosphereShellRenderer === null) return false;
    const bodyId = view.slab.frame.bodyId;
    return atmosphereDrawList(state, ctx).some((entry) => entry.body.id === bodyId);
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.atmosphereShellRenderer;
    if (renderer === null || view.slab.frame.kind !== 'body-m') return;
    const bodyId = view.slab.frame.bodyId;
    const entry = atmosphereDrawList(state, ctx).find((e) => e.body.id === bodyId);
    if (entry === undefined) return;
    renderer.draw(
      pass,
      entry.body.id,
      atmosphereShellUniforms(entry, view.slab, ctx, state),
      entry.inside,
    );
  },
};
