/**
 * deriveFrameView — everything one frame's camera and settings determine
 * before any GPU work: the matrices, the visibility fade, the debug-view
 * weights, the dust slice edges and the analytic exposure.
 *
 * Pure, and separated from `drawFrame` for that reason — this is where the
 * frame's arithmetic lives, and the only part of the frame a test can reach
 * without a device. What stays in the engine is the pass ENCODING, which is a
 * straight-line sequence over every pipeline and bind group it owns; routing
 * that through a parameter bag would trade a real dependency for a wide one.
 */
import { mat4 } from 'wgpu-matrix';

import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { DebugViewWeights } from '../../../@types/engine/DebugViewWeights';
import type { FieldDustSlices } from '../../../@types/engine/FieldDustSlices';
import type { MilkyWayFadeReadout } from '../../../@types/engine/MilkyWayFadeReadout';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';
import type { IsmMapChannelWeights } from '../../../@types/engine/IsmMapChannelWeights';

import { debugGalaxyWeight } from './debugGalaxyWeight';
import { debugViewWeights } from './debugViewWeights';
import { deriveMilkyWayFade } from './deriveMilkyWayFade';
import { dustSliceEdges } from '../field/dustSliceEdges';
import { lerp } from '../../../../../src/utils/math/lerp';
import { smoothstep } from '../../../../../src/utils/math/smoothstep';

/**
 * The gauge for the analytic field's arbitrary flux units: the scalar at which
 * `analyticExposure = 1.0` is the calibrated look. Hand-pinned by eye, so it
 * carries no derivation — only a landmine.
 *
 * It must not be reconstituted from the sprite pass's `starIntensity` and
 * `sizeScale`, which is what it was until the field's exposure drifted x2.4446
 * behind a retune of those two SPRITE knobs. That coupling cannot buy
 * sprite/field parity anyway: the sprite pass's light also carries its `count`,
 * so matching the other two terms tracks nothing. The field's exposure is
 * `analyticExposure` alone, as the slider's label promises.
 */
const FIELD_EXPOSURE_GAUGE = 0.0539;

/**
 * Anchors (disc radii) for the star-grain feature-scale blend: below
 * `NEAR_R` the camera is close enough that the near calibration alone
 * applies, beyond `FAR_R` the far one does. Eyeballed, not derived — tunable
 * alongside `starGrainFeatureScaleNear`/`Far` in `defaultRenderSettings.ts`.
 */
const STAR_GRAIN_SCALE_NEAR_R = 1.0;
const STAR_GRAIN_SCALE_FAR_R = 4.0;

export type FrameView = {
  readonly view: Float32Array;
  readonly proj: Float32Array;
  readonly viewProj: Float32Array;
  readonly aspect: number;
  readonly fade: MilkyWayFadeReadout;
  readonly galaxyWeight: number;
  readonly debugViews: DebugViewWeights;
  readonly ismMapChannels: IsmMapChannelWeights;
  readonly dustSlices: FieldDustSlices;
  /** `render.analyticExposure` against `FIELD_EXPOSURE_GAUGE`, scaled by the fade. Independent of the sprite pass's `starIntensity`/`sizeScale`. */
  readonly analyticExposure: number;
  /**
   * `render.starGrainFeatureScaleNear`/`Far`, blended by log camera distance
   * (disc radii) — the single scalar `FieldHeaderInput.starGrainFeatureScale`
   * still carries. See `STAR_GRAIN_SCALE_NEAR_R`/`FAR_R` above.
   */
  readonly starGrainFeatureScale: number;
};

export function deriveFrameView(input: {
  readonly eye: Vec3;
  readonly target: Vec3;
  readonly fov: number;
  /** DAMPED orbit distance — the near/far planes must track this, not the live one, or the frustum snaps a frame ahead of the image. */
  readonly dist: number;
  /** Horizontal lens shift for the current panel insets, already resolved. */
  readonly shiftX: number;
  readonly viewportPx: Vec2;
  readonly render: RenderSettings;
  /** The dust's reach R, cached across frames by the dust rebuild — only the SLICE EDGES are view-dependent. */
  readonly dustReachR: number;
}): FrameView {
  const { eye, fov, dist, viewportPx, render } = input;
  const view = mat4.lookAt(eye, input.target, [0, 1, 0]);
  // Near/far track orbit distance, the same adaptation the app's NEAR0 slab
  // makes and for the same reason: a fixed near plane slices through the disc
  // once you descend into it. There is no depth attachment, so the usual
  // precision cost of a tiny near plane does not apply — these only clip. Far
  // keeps the whole cloud in view from inside the disc as well as outside it.
  const near = Math.max(1e-4, dist * 0.002);
  const far = dist * 2 + 200;
  const aspect = viewportPx[0] / viewportPx[1];
  const proj = mat4.perspective(fov, aspect, near, far);
  proj[8] = input.shiftX; // lens shift to centre in the visible area

  // `viewportPx[1]`, not the aggregate target's height, for the same reason the
  // app passes `ctx.canvasSize.height`: the fade band asks how big the disc
  // looks to the USER.
  const fade = deriveMilkyWayFade(eye, fov, viewportPx[1], {
    anchor: render.fadeAnchor,
    enabled: render.fadeEnabled,
    approachFullAt: render.fadeApproachFullAt,
    approachGoneAt: render.fadeApproachGoneAt,
    fullPx: render.fadeFullPx,
    gonePx: render.fadeGonePx,
  });
  // Read once here and shared by the uniform packs AND the per-pass gates, so
  // a pass can never run at a weight its own header says is 0.
  const debugViews = debugViewWeights(render);
  // MAX, not SUM — see debugGalaxyWeight. Shared by the sprite fadeAlpha and
  // every field header this frame, so the galaxy dims by exactly the same
  // amount whichever representation is drawing it.
  const galaxyWeight = debugGalaxyWeight(debugViews);

  // Distance from the galaxy's centre (not the orbit target — see the
  // `dustSlices` comment below), in disc radii, on a log axis: a linear
  // blend would spend nearly its whole range in the far regime, since
  // `dist` traverses orders of magnitude between close approach and a
  // whole-galaxy framing.
  const camDistFromOrigin = Math.hypot(eye[0], eye[1], eye[2]);
  const grainT = smoothstep(
    Math.log(STAR_GRAIN_SCALE_NEAR_R),
    Math.log(STAR_GRAIN_SCALE_FAR_R),
    Math.log(camDistFromOrigin / input.dustReachR),
  );
  const starGrainFeatureScale = lerp(
    render.starGrainFeatureScaleNear,
    render.starGrainFeatureScaleFar,
    grainT,
  );

  return {
    view,
    proj,
    viewProj: mat4.multiply(proj, view),
    aspect,
    fade,
    galaxyWeight,
    debugViews,
    ismMapChannels: {
      gasWeight: render.ismMapGasWeight,
      starsWeight: render.ismMapStarsWeight,
      activityWeight: render.ismMapActivityWeight,
      dustWeight: render.ismMapDustWeight,
    },
    // D is the eye's distance to the primary galaxy's centre (the tool's
    // origin, NOT the orbit target — the two differ once the camera pans).
    dustSlices: dustSliceEdges(camDistFromOrigin, input.dustReachR),
    analyticExposure: render.analyticExposure * FIELD_EXPOSURE_GAUGE * fade.alpha,
    starGrainFeatureScale,
  };
}
