/**
 * ReadyFrameContext — the discriminated-ready case of `FrameContext`.
 *
 * Pre-D.1, the per-frame body opened with five free-standing snapshot
 * locals — `camRef`, `vp`, `rendererRef`, `thumbnailsRef`,
 * `postProcessRef` — followed by a 5-way null check that bailed out
 * if *any* of them was unset.  The same body then forwarded each of
 * those snapshots, plus two more derived scalars (`drawCamPos`,
 * `drawPxPerRad`), into `renderFrame()` as separate `RenderFrameInput`
 * fields.  `renderFrame()` itself recomputed `drawCamPos` and
 * `drawPxPerRad` from `cam` because the caller hadn't bothered passing
 * the derived values along.
 *
 * The fix is one named struct, derived once at the top of the frame
 * body and consumed by every downstream site that asks "what's the
 * camera doing this frame?".  Adding a new derived per-frame quantity
 * (e.g. frustum planes for culling, or a cached camera-distance scalar)
 * becomes a one-line addition here, not a 4-snapshot scatter across
 * two files.
 *
 * ### Why `drawCamPos: Readonly<Vec3>` (a tuple)
 *
 * `OrbitCamera.position` is a mutable `Vec3` tuple, updated in place by
 * `updatePosition`.  Forwarding the live array to downstream
 * passes risks two failure modes: (a) a consumer accidentally mutating
 * an entry (array writes don't fault), and (b) the camera moving
 * between the snapshot point and the read point inside one frame —
 * possible in principle if a future feature lets a tween advance
 * mid-frame.  Snapshotting to a plain readonly tuple defends against
 * both: the array is small (3 floats — copy is essentially free), the
 * shape is pinned, and the `Readonly<...>` modifier makes attempted
 * writes a tsc error.
 *
 * ### Why the GPU handles ride along on the ready context
 *
 * `state.gpu.renderer`, `state.gpu.postProcess`, and
 * `state.subsystems.thumbnails` are all part of the 5-way bootstrap
 * gate.  Once the gate passes, downstream code wants to use those
 * handles without re-checking they're non-null — but if we left them
 * on `state.gpu.*` and `state.subsystems.*`, every consumer would have
 * to re-narrow them locally (since TS can't track that *another
 * function* asserted them non-null earlier in the call stack).
 *
 * Forwarding the narrowed handles onto `ReadyFrameContext` carries the
 * narrowing across the function boundary.  A pass implementation can
 * read `ctx.renderer.draw(...)` directly, no `!` needed.
 */

import type { Mat4 } from 'wgpu-matrix';

import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { Vec3 } from '../../math/Vec3';
import type { PointRenderer } from '../../rendering/PointRenderer';
import type { PostProcess } from '../../rendering/PostProcess';
import type { VolumeOffscreen } from '../../rendering/VolumeOffscreen';
import type { TexturedDiskSubsystem } from '../subsystems/TexturedDiskSubsystem';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';

/** The ready case: every per-frame derived value is non-null. */
export type ReadyFrameContext = {
  isReady: true;
  /** Live camera reference. */
  cam: OrbitCamera;
  /** Combined view-projection matrix, computed once per frame. */
  vp: Mat4;
  /** Backing-store-pixel viewport size; same as `canvas.{width,height}`. */
  canvasSize: { width: number; height: number };
  /** Snapshot of `cam.position` as a readonly tuple (no live Float32Array aliasing). */
  drawCamPos: Readonly<Vec3>;
  /** `canvasSize.height / (2·tan(fovY/2))` — pinhole radian→pixel conversion. */
  drawPxPerRad: number;
  /** Structure-focus recession blend 0→1, from structureFocus.produceFocusUniforms (ticked once/frame). */
  focusBlend: number;
  /** Galaxy-catalog draw mask (deriveSourceMasks(state).draw), this frame. */
  visibleSourceMask: number;
  /** Full cluster-focus uniform value (produceFocusUniforms, ticked once/frame). */
  focus: FocusUniformsValue;
  /**
   * Non-null GPU + subsystem handles, narrowed across the bootstrap
   * gate so consumers don't have to re-check `state.gpu.*` /
   * `state.subsystems.*` themselves.  See the module header for the
   * "why these ride along" rationale.
   */
  renderer: PointRenderer;
  postProcess: PostProcess;
  /**
   * Half-resolution rgba16float intermediate render target.  Volume
   * passes write into this target (at 1/4 the fragment count) and the
   * `volumeUpsamplePass` bilinearly blends it into the HDR view.
   * Forwarded here from `state.gpu.volumeOffscreen` — same reference,
   * no allocation — so downstream passes can write
   * `ctx.volumeOffscreen.view` without reaching back into `state`.
   */
  volumeOffscreen: VolumeOffscreen;
  texturedDisks: TexturedDiskSubsystem;
  /**
   * F64 view-projection matrix for the foreground pass, expressed relative to
   * `renderOrigin`. Computed once per frame via `computeForegroundViewProj` so
   * the foreground renderer doesn't need to recompute it. All per-object model
   * matrices passed to the foreground pass must also be expressed relative to
   * `renderOrigin` for the MVP product to be correct.
   */
  readonly foregroundVp: Float64Array;
  /**
   * Near clip plane distance in Mpc for the foreground frustum.
   *
   * Plan 01: a simple heuristic proportional to `cam.distance` (see
   * `frameContext.ts`). Plan 03 replaces this with an adaptive value from
   * `foregroundFrustum(cam.distance)` in `src/utils/camera/foregroundFrustum.ts`
   * to keep Earth-at-true-scale inside the frustum throughout the descent.
   */
  readonly foregroundNear: number;
  /**
   * Far clip plane distance in Mpc for the foreground frustum.
   *
   * Plan 01: a simple heuristic proportional to `cam.distance`. Plan 03 makes
   * this adaptive; see `foregroundNear` above.
   */
  readonly foregroundFar: number;
  /**
   * The world-space render origin in Mpc. All foreground object model matrices
   * and the foreground view-projection matrix are expressed relative to this
   * point. Currently fixed at `RENDER_ORIGIN_MPC` = [0, 0, 0] (the Sun);
   * a future floating-origin scheme would update this per-frame to reduce
   * floating-point precision loss as the camera moves far from the Sun.
   */
  readonly renderOrigin: Readonly<Vec3>;
};
