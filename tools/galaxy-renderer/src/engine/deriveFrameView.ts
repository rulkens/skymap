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

import type { Vec2 } from '../../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { MilkyWayFadeReadout } from '../../@types/engine/MilkyWayFadeReadout';
import type { RenderSettings } from '../../@types/engine/RenderSettings';

import { debugGalaxyWeight } from './debugGalaxyWeight';
import { deriveMilkyWayFade } from './deriveMilkyWayFade';
import { dustSliceEdges } from './dustSliceEdges';
import type { DebugViewWeights, FieldDustSlices, SfMapChannelWeights } from './packFieldUniforms';

export type FrameView = {
  readonly view: Float32Array;
  readonly proj: Float32Array;
  readonly viewProj: Float32Array;
  readonly aspect: number;
  readonly fade: MilkyWayFadeReadout;
  readonly galaxyWeight: number;
  readonly debugView: DebugViewWeights;
  readonly sfMapChannels: SfMapChannelWeights;
  readonly dustSlices: FieldDustSlices;
  /** The star pass's own multipliers folded in, so `analyticExposure` 1.0 means sprite/field parity as the sliders move, not only at defaults. */
  readonly analyticExposure: number;
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
  const fade = deriveMilkyWayFade(eye, fov, viewportPx[1], render);
  // MAX, not SUM — see debugGalaxyWeight. Shared by the sprite fadeAlpha and
  // every field header this frame, so the galaxy dims by exactly the same
  // amount whichever representation is drawing it.
  const galaxyWeight = debugGalaxyWeight(render);

  return {
    view,
    proj,
    viewProj: mat4.multiply(proj, view),
    aspect,
    fade,
    galaxyWeight,
    debugView: {
      dustViewIntensity: render.dustViewIntensity,
      sfMapViewIntensity: render.sfMapViewIntensity,
      orientationViewIntensity: render.orientationViewIntensity,
      galaxyWeight,
    },
    sfMapChannels: {
      gasWeight: render.sfMapGasWeight,
      recentSfWeight: render.sfMapRecentWeight,
      activityWeight: render.sfMapActivityWeight,
    },
    // D is the eye's distance to the primary galaxy's centre (the tool's
    // origin, NOT the orbit target — the two differ once the camera pans).
    dustSlices: dustSliceEdges(Math.hypot(eye[0], eye[1], eye[2]), input.dustReachR),
    analyticExposure:
      render.analyticExposure * render.starIntensity * render.sizeScale ** 2 * fade.alpha,
  };
}
