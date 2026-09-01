/**
 * atmosphereShellLayer — Earth's (and any seeded planet's) physically-based
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
 * distance. Per-pixel scene-depth-aware aerial perspective (arbitrary occluder
 * depth, in-atmosphere descent) is the deferred froxel upgrade.
 *
 * ### Why it draws LAST, OVER not opaque (spec §8.3)
 *
 * The atmosphere is the outermost translucent member of the `(foreground:0,
 * 'body')` group — registered LAST in `CONTENT_LAYERS`, after the opaque
 * bodies, the rings, AND Earth's cloud shell, so it draws once every opaque
 * sphere has stamped its depth. Its pipeline depth-TESTS against them
 * (`depthCompare: 'greater-equal'`, the body-m slab's reversed-Z convention —
 * clear `0.0`, greater-z-wins; the EQUAL half lets the shell hugging a body's
 * own surface still pass against the depth that surface stamped) but writes
 * NO depth. The shell draws its geometry TWICE — MULTIPLY for per-channel
 * extinction, then ADD for the in-scatter — because one alpha channel cannot
 * attenuate three wavelengths; the `blend: 'over'` this row carries is target-
 * GROUPING metadata (it is what sorts the row into the translucent half),
 * never applied to a pipeline. It is non-pickable (a translucent halo has no
 * clickable silhouette; clicking Earth hits the opaque surface `earthLayer`
 * stamps into the pick pass), so it declares no `drawPick`.
 *
 * ### The f64 seam — `ctx.bodyPose`, not a re-derived camera basis
 *
 * Same seam as every body-slab layer: this row's `pose = ctx.bodyPose(bodyId)`
 * is the SAME closure `deriveSlabs` built this row's `view.slab.vp` from. See
 * `composeBodySlabMvp`'s module header.
 *
 * ### Which bodies draw this frame
 *
 * `enabled` and `draw` both consult `atmosphereDrawList` — the ONE per-frame
 * derivation of which seeded bodies have a live atmosphere (an
 * `ATMOSPHERE_PARAMS` row, inside `FOREGROUND_MAX_DISTANCE_MPC`, above the
 * shared sub-pixel disc cull) — filtered to THIS row's `bodyId`. Because the
 * sky-view bake (`encodeAtmosphereSkyView`) reads the SAME unfiltered list,
 * bake↔draw is equality by construction: a frame can never draw the shell
 * against a LUT it skipped baking. `positionMpc`/`orientation` come from that
 * SAME resolved entry (one `sceneBodyStates` read, shared with the bake), so
 * `sunDirLocal` cannot drift from the sky-view LUT's own sun direction.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { mat4d } from 'wgpu-matrix';
import { composeBodySlabMvp } from '../../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../utils/camera/bodySlabCamLocal';
import { sunDirLocal } from '../../../../utils/camera/sunDirLocal';
import { isInsideAtmosphereShell } from '../../../../utils/camera/isInsideAtmosphereShell';
import { packAtmosphereUniforms } from '../../../../utils/gpu/packAtmosphereUniforms';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { atmosphereDrawList } from '../atmosphereDrawList';

export const atmosphereShellLayer: ContentLayer = {
  name: 'atmosphere-shell',
  slab: 'body',
  target: 'foreground:0',
  blend: 'over',

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
    // The SAME pose-provider closure `deriveSlabs` was fed to build this row's
    // `view.slab.vp` — reading it here instead of re-deriving the pose is what
    // keeps this layer's eyeRelBodyM from ever drifting off that basis.
    const pose = ctx.bodyPose(bodyId);
    if (pose === null) return;
    const { body, params, positionMpc, orientation } = entry;

    // Scale the unit proxy sphere to the ATMOSPHERE-TOP radius (the shell's
    // outer extent), in metres — the body-m slab frame's own unit.
    const atmosphereTopM = params.atmosphereTopKm * SCALE_UNITS.KM_TO_M;
    const mvp = composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, atmosphereTopM);
    // Inverted from the UN-narrowed f64 mvp (dst-last, fresh Float64Array) for
    // the inside-shell entry points' screen→local unproject. Narrowing mvp to
    // f32 first would reintroduce the per-element rounding the slab seam exists
    // to avoid, here for a different consumer.
    const invMvp = mat4d.inverse(mvp);
    // Sun rotated into the body's local frame (its resolved orientation carries
    // the axial tilt), co-framed with the in-scatter integral's sun direction.
    const sun = sunDirLocal(positionMpc, RENDER_ORIGIN_MPC, orientation);
    // The camera in atmosphere-top-radius units — the view vector the in-scatter
    // fragment marches along. Matches the altitude `encodeAtmosphereSkyView`
    // bakes the sky-view LUT from (same pose, same atmosphere-top scale).
    const camLocal = bodySlabCamLocal(pose.eyeRelBodyM, atmosphereTopM);
    // Ground/atmosphere-top radius ratio ∈ (0,1): in the proxy's local frame the
    // atmosphere top is the unit sphere and the ground sphere has this radius.
    const bottomRadius = params.planetRadiusKm / params.atmosphereTopKm;
    // Exposure resolution — the one Earth-keyed branch: Earth alone carries a
    // live Settings → Display → Earth slider (seeded from
    // `ATMOSPHERE_PARAMS.earth.exposure`), so it reads the store value each frame
    // (`EngineState.settings` is a live getter — a drag overrides the limb
    // without a reload); every other body reads its own params-row `exposure`.
    const exposure =
      body.id === 'earth' ? state.settings.earth.atmosphereExposure : params.exposure;
    // The host's ring annulus in the proxy's LOCAL units (atmosphere top = 1),
    // so the fragment can keep a ring in FRONT of the atmosphere from being
    // darkened by the shell's over-blend. No `SCENE_RINGS` row ⇒ both ratios 0
    // (the no-ring sentinel) — the same data-gate the ring-shadow path uses.
    const ring = SCENE_RINGS.find((r) => r.bodyId === body.id);
    const ringInnerRatio = ring === undefined ? 0 : ring.innerRadiusKm / params.atmosphereTopKm;
    const ringOuterRatio = ring === undefined ? 0 : ring.outerRadiusKm / params.atmosphereTopKm;
    // camLocal is already atmosphere-top-radius units, so this is the one
    // comparison spec §4.1 calls for — no new per-frame derivation. The handoff
    // sits slightly OUTSIDE the top (margin rationale lives in the util).
    const inside = isInsideAtmosphereShell(camLocal);
    renderer.draw(
      pass,
      body.id,
      packAtmosphereUniforms(
        // Narrow here, at the GPU uniform write — composeBodySlabMvp returns f64.
        narrowMat4(mvp),
        narrowMat4(invMvp),
        sun,
        camLocal,
        bottomRadius,
        exposure,
        ringInnerRatio,
        ringOuterRatio,
      ),
      inside,
    );
  },
};
