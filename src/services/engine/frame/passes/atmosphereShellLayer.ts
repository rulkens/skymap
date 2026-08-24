/**
 * atmosphereShellLayer — Earth's physically-based in-scatter atmosphere as the
 * LAST content-layer row, drawn into the depth-bearing `foreground:0` target
 * (spec §8.3). A translucent proxy sphere scaled to the atmosphere-TOP radius,
 * sitting just outside the cloud shell.
 *
 * ### What it draws — the blue limb, reddened terminator, and over-disc haze
 *
 * For each atmosphere body resolved this frame (only the seeded `bodies.earth`
 * today), this layer draws its atmosphere-top proxy sphere through the shared
 * `atmosphereShellRenderer`. The renderer's shell pipeline draws BOTH walls (no
 * cull) and the fragment splits duty by facing: the NEAR wall carries the
 * over-disc aerial perspective (haze on the lit disc), the FAR wall the limb +
 * sky. Depth-testing each wall against the already-stamped opaque scene keeps
 * cross-body occlusion for both — a nearer body occludes the disc haze via the
 * near wall's depth and the limb via the far wall's. The fragment samples this
 * frame's sky-view LUT (baked by the `atmosphereSkyView` compute step, in the
 * compute prelude) to compose the in-scattered radiance: a blue limb over the day
 * side, a reddened arc along the terminator/sunset, and haze greying the disc with
 * distance. Per-pixel scene-depth-aware aerial perspective (arbitrary occluder
 * depth, in-atmosphere descent) is the deferred froxel upgrade.
 *
 * ### Why it draws LAST, OVER not opaque (spec §8.3)
 *
 * The atmosphere is the outermost translucent member of the `(foreground:0, NEAR0)`
 * group. It is registered LAST in `CONTENT_LAYERS` — after the opaque bodies, the
 * rings, AND Earth's cloud shell (which are NON-adjacent to it: the opaque spheres
 * and rings sit between the cloud shell and this shell) — so it draws once every
 * opaque sphere has stamped its depth. Its pipeline depth-TESTS against them
 * (`depthCompare: 'greater-equal'`, the NEAR0 slab's reversed-Z convention — clear
 * `0.0`, greater-z-wins; the EQUAL half lets the shell hugging a body's own surface
 * still pass against the depth that surface stamped) but writes NO depth. The shell
 * draws its geometry TWICE — MULTIPLY for per-channel extinction, then ADD for the
 * in-scatter — because one alpha channel cannot attenuate three wavelengths; the
 * `blend: 'over'` this row carries is target-GROUPING metadata (it is what sorts the
 * row into the translucent half), never applied to a pipeline.
 * It is non-pickable (a translucent halo has no clickable silhouette;
 * clicking Earth hits the opaque surface `earthLayer` stamps into the pick pass),
 * so it declares no `drawPick`.
 *
 * ### The f64 seam — why `view.slab.vp`, NOT `view.vp`
 *
 * Same seam as `earthLayer` and every sphere-body layer: Earth sits ~1 AU from the
 * render origin, a tiny Mpc number the VP's large translation nearly cancels.
 * `composeBodyMvp` resolves that cancellation in double precision before narrowing
 * to f32; feeding it the already-narrowed `view.vp` would misplace the shell by
 * more than its own thickness. See `composeBodyMvp`'s module header.
 *
 * ### When it draws
 *
 * Both `enabled` and `draw` iterate the ONE shared `atmosphereDrawList` — the
 * per-frame derivation of which seeded bodies have a live atmosphere shell: a body
 * with an `ATMOSPHERE_PARAMS` row (Moon / gas giants have none — the same data-gate
 * the ring table uses), inside the shared near-field distance edge
 * (`FOREGROUND_MAX_DISTANCE_MPC`), and above the shared sub-pixel disc cull.
 * `enabled` additionally requires the renderer handle. Because the sky-view bake
 * (`encodeAtmosphereSkyView`) reads the SAME list, bake↔draw is equality by
 * construction — the shell bakes this frame's LUT iff it draws it — so a frame can
 * never draw the shell against a LUT it skipped baking.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { NEAR0 } from '../slabs';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { mat4d } from 'wgpu-matrix';
import { composeBodyMvp } from '../../../../utils/camera/composeBodyMvp';
import { packAtmosphereUniforms } from '../../../../utils/gpu/packAtmosphereUniforms';
import { narrowMat4 } from '../../../../utils/math/narrowMat4';
import { atmosphereDrawList } from '../atmosphereDrawList';

export const atmosphereShellLayer: ContentLayer = {
  name: 'atmosphere-shell',
  slab: NEAR0,
  target: 'foreground:0',
  blend: 'over',

  enabled(state, ctx) {
    // Handle first: the check short-circuits so pre-bootstrap fixtures (null
    // renderer, bare ctx) never touch the body inputs.
    if (state.gpu.atmosphereShellRenderer === null) return false;
    return atmosphereDrawList(state, ctx).length > 0;
  },

  draw(pass, view, ctx, state) {
    const renderer = state.gpu.atmosphereShellRenderer;
    if (renderer === null) return;

    for (const {
      body,
      params,
      positionMpc,
      orientation,
      camPosLocal: camLocal,
      sunDirLocal: sun,
    } of atmosphereDrawList(state, ctx)) {
      // Scale the unit proxy sphere to the ATMOSPHERE-TOP radius (the shell's
      // outer extent) from the slab's f64 vp (the f64 seam), folding in the entry's
      // resolved orientation so the sky-view frame co-registers with the surface.
      const atmosphereTopMpc = params.atmosphereTopKm * SCALE_UNITS.KM_TO_MPC;
      const mvp = composeBodyMvp(
        view.slab.vp,
        positionMpc,
        RENDER_ORIGIN_MPC,
        atmosphereTopMpc,
        orientation,
      );
      // Inverted from the UN-narrowed f64 mvp, mirroring labelLeaderLine.ts's
      // mat4d.inverse(m) — dst-last, fresh Float64Array. Narrowing mvp to f32
      // first would reintroduce the per-element rounding composeBodyMvp's
      // header warns against, here for a different consumer.
      const invMvp = mat4d.inverse(mvp);
      // camLocal/sun destructured off the entry — atmosphereDrawList derives both
      // once per body now (spec §5a hoist), so this draw and the sky-view bake read
      // the same pair instead of each re-deriving it.
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
      renderer.draw(
        pass,
        body.id,
        packAtmosphereUniforms(
          // Narrow here, at the GPU uniform write — composeBodyMvp returns f64.
          narrowMat4(mvp),
          narrowMat4(invMvp),
          sun,
          camLocal,
          bottomRadius,
          exposure,
          ringInnerRatio,
          ringOuterRatio,
        ),
      );
    }
  },
};
