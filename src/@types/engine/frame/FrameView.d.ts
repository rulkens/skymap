/**
 * FrameView — one view of the frame, and what every pass receives as `ctx`.
 * `deriveView` mints it from the frame context and a `ViewSpec`; view fields
 * read `ctx.x`, frame fields `ctx.snapshot.x`. Flat by design: `canvasSize`,
 * `viewSlot`, `viewKind` and `output` are fields, not a `spec` a pass would
 * have to know to reach through.
 */

import type { Mat4 } from 'wgpu-matrix';

import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { ViewFrustum } from '../../camera/ViewFrustum';
import type { Vec3 } from '../../math/Vec3';
import type { Size } from '../../rendering/Size';
import type { BodyPoseProvider } from '../camera/BodyPoseProvider';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { Slab } from './Slab';
import type { ViewKind } from './ViewKind';

export type FrameView = {
  /** The frame context, BY REFERENCE — every view shares it. NOT `frame`:
   *  that word already means a rung tag and a coordinate frame elsewhere. */
  snapshot: ReadyFrameContext;
  /** THIS view's camera — always `turnedOrbitCamera(snapshot.cam, …)`; the
   *  true pose is `snapshot.cam`, never fed back to the camera path. */
  cam: OrbitCamera;
  /** Combined view-projection matrix, computed once per view. */
  vp: Mat4;
  /** This view's slab table (`deriveSlabs`) — array position === `Slab.index`. */
  slabs: readonly Slab[];
  /** `snapshot.bodyPose` turned and offset by this view's spec
   *  (`viewBodyPose`) — the SAME closure `slabs` was built from. */
  bodyPose: BodyPoseProvider;
  /** THIS view's target size in backing-store pixels. */
  canvasSize: Size;
  /** This view's eye: the camera's, plus the spec's rotated eye offset. */
  drawCamPos: Readonly<Vec3>;
  /** This view's projection as tangents of the half-angles from the view axis
   *  (`spec.frustum`) — the view's definition; `drawPxPerRad` and `fovYRad`
   *  both derive from it. */
  frustum: ViewFrustum;
  /** `canvasSize.height / (tanUp − tanDown)` of this view's frustum — pinhole radian→pixel conversion. */
  drawPxPerRad: number;
  /** This view's vertical field of view in radians — its frustum's extents. */
  fovYRad: number;
  /** Which physical GPU destination this view's draws land in: `0` = the
   *  canvas, a capture row's six faces claim `viewSlotBase … +5`. A roster
   *  renderer keys per-frame writes on this (RENDERER.md #1's write-before-
   *  submit landmine); not a capture test — that's `viewKind`. */
  viewSlot: number;
  /** `'capture'` only on a cubemap face — see `ViewKind`. */
  viewKind: ViewKind;
  /** Where a `swap`-targeted step resolves for THIS view; unset falls back
   *  to the acquired swap-chain view (the canvas view, every mono view). */
  output?: GPUTextureView;
};
