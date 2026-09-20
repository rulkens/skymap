/**
 * FrameView — one view of the frame, and what every pass receives as `ctx`.
 * `deriveView` mints it from the frame context and a `ViewSpec`; view fields
 * read `ctx.x`, frame fields `ctx.snapshot.x`. Flat by design: `canvasSize`,
 * `viewSlot`, `viewKind` and `output` are fields, not a `spec` a pass would
 * have to know to reach through.
 */

import type { Mat4 } from 'wgpu-matrix';

import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { Vec3 } from '../../math/Vec3';
import type { Size } from '../../rendering/Size';
import type { BodyPoseProvider } from '../camera/BodyPoseProvider';
import type { ReadyFrameContext } from './ReadyFrameContext';
import type { Slab } from './Slab';
import type { ViewKind } from './ViewKind';

export type FrameView = {
  /**
   * The frame context, BY REFERENCE — every view of a frame holds the same
   * object, which is what makes their clock, body states and stamps one thing.
   * NOT named `frame`: that word already means a rung tag (`PoseFrame`,
   * `camera.base.frame`) and a coordinate frame (`slab.frame`), so
   * `ctx.frame.nowMs` beside `slab.frame.kind` misreads.
   */
  snapshot: ReadyFrameContext;
  /**
   * THIS view's camera — always `turnedOrbitCamera(snapshot.cam, …)`, so every
   * `ctx.cam` reader (ray-marched shells, billboard axes) draws this view and
   * not the frame's orientation. `yaw`/`pitch`/`roll` are 0 and the pose is
   * carried by `poseBasis`/`upBasis`; `distance` stays the orbit's, so the
   * foreground distance gates agree. Never fed back to the camera path:
   * framing reads state.
   */
  cam: OrbitCamera;
  /** Combined view-projection matrix, computed once per view. */
  vp: Mat4;
  /**
   * This view's slab table (`deriveSlabs`) — array position === `Slab.index`.
   * `slabViewOf` resolves a `FrameStep`'s `slab: number` into a `SlabView`
   * by indexing straight into this array.
   */
  slabs: readonly Slab[];
  /**
   * The SAME pose-provider closure `deriveSlabs` was fed to build `slabs`:
   * `snapshot.bodyPose` turned and offset by this view's spec (`viewBodyPose`),
   * so an engaged body arm keeps its metre-native path in every view.
   */
  bodyPose: BodyPoseProvider;
  /** THIS view's target size in backing-store pixels; the canvas view's is
   *  `canvas.{width,height}`. (Name kept: 37 read sites.) */
  canvasSize: Size;
  /** This view's eye: the camera's, plus the spec's rotated eye offset. */
  drawCamPos: Readonly<Vec3>;
  /** `canvasSize.height / (tanUp − tanDown)` of this view's frustum — pinhole radian→pixel conversion. */
  drawPxPerRad: number;
  /** This view's vertical field of view in radians — its frustum's extents. */
  fovYRad: number;
  /**
   * Which physical GPU destination this view's draws land in: `0` = the canvas
   * view, and a capture row's six faces claim `viewSlotBase … viewSlotBase + 5`
   * (`faceViewSpec`, keyed per row in `src/data/rendering/cubemapCaptures.ts`).
   * A capture sweep records several `draw()` calls against DIFFERENT views
   * before one `submit()` — the `queue.writeBuffer`-before-`submit` landmine
   * (docs/RENDERER.md #1) means a renderer-owned buffer shared across those
   * calls would keep only the LAST write. A roster renderer keys its per-frame
   * writes on this field (via a view-slot buffer helper, `src/utils/gpu/`)
   * instead of overwriting one shared destination, so each call's bytes survive
   * to its own draw. Not a capture test — that is `viewKind`.
   */
  viewSlot: number;
  /** `'capture'` only on a cubemap face — see `ViewKind`. */
  viewKind: ViewKind;
  /**
   * Where a `swap`-targeted step's `viewFor('swap', …)` resolves for THIS
   * view — a rig view's own offscreen destination; unset for the canvas view
   * and every mono view, so `viewFor` falls back to the acquired swap-chain
   * view as it does today.
   */
  output?: GPUTextureView;
  /**
   * The render-target ids THIS view's program has drawn into so far — minted
   * fresh per `deriveView` and populated by the executor as it opens the first
   * pass against each target. A later pass that samples an earlier target's
   * texture guards on it, mirroring the executor's composite step, which skips
   * compositing a source that was never rendered this frame. Per view, not per
   * frame: a target first-touched in view A must still CLEAR rather than load
   * in view B. The near-field caption occlusion reads it to avoid sampling the
   * `foreground:0` depth on a frame where no body drew (the executor skips an
   * empty render step, leaving that depth stale/uninitialised).
   */
  renderedTargets: ReadonlySet<string>;
};
