/**
 * deriveFrameView — what one frame's camera and settings determine before any
 * GPU work, on the tool's side: the matrices, the field camera, the
 * visibility fade and the debug-view weights. The field's own header lanes
 * come from `deriveFieldFrameLanes`. Pure, and separated from `drawFrame` for
 * that reason — the only part of the frame a test can reach without a device.
 */
import { mat4 } from 'wgpu-matrix';

import type { Vec2 } from '../../../../../src/@types/math/Vec2';
import type { FieldView } from '../../../../../src/layers/milkyWay/field/@types/FieldView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { DebugViewWeights } from '../../../../../src/layers/milkyWay/field/header/@types/DebugViewWeights';
import type { MilkyWayFadeReadout } from '../../../@types/engine/MilkyWayFadeReadout';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';

import { debugGalaxyWeight } from './debugGalaxyWeight';
import { debugViewWeights } from './debugViewWeights';
import { deriveMilkyWayFade } from './deriveMilkyWayFade';
import { shiftedFrustum } from '../../../../../src/services/engine/camera/lens/utils/shiftedFrustum';

export type FrameView = {
  readonly view: Float32Array;
  readonly proj: Float32Array;
  readonly viewProj: Float32Array;
  /** The field's camera; the tool's galaxy frame is its world frame, so no transform. */
  readonly camera: FieldView;
  readonly fade: MilkyWayFadeReadout;
  readonly galaxyWeight: number;
  readonly debugViews: DebugViewWeights;
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
  // A lookAt view's rotation ROWS are the camera's world axes; column-major,
  // so each row is a stride-4 gather, and row 2 points away from the target.
  // `proj[8] = shiftX` puts the window centre at shiftX half-widths, so the
  // axis lands at −shiftX in `shiftedFrustum`'s terms.
  const camera: FieldView = {
    eye,
    right: [view[0]!, view[4]!, view[8]!],
    up: [view[1]!, view[5]!, view[9]!],
    fwd: [-view[2]!, -view[6]!, -view[10]!],
    frustum: shiftedFrustum(fov, aspect, [-input.shiftX, 0]),
  };

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

  return {
    view,
    proj,
    viewProj: mat4.multiply(proj, view),
    camera,
    fade,
    // MAX, not SUM — see debugGalaxyWeight. Shared by the sprite fadeAlpha and
    // every field header this frame, so the galaxy dims by exactly the same
    // amount whichever representation is drawing it.
    galaxyWeight: debugGalaxyWeight(debugViews),
    debugViews,
  };
}
