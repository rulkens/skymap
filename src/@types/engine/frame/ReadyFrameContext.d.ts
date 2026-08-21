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
 * `state.gpu.galaxyPointRenderer`, `state.gpu.renderTargets`, and
 * `state.subsystems.thumbnails` are all part of the 5-way bootstrap
 * gate.  Once the gate passes, downstream code wants to use those
 * handles without re-checking they're non-null — but if we left them
 * on `state.gpu.*` and `state.subsystems.*`, every consumer would have
 * to re-narrow them locally (since TS can't track that *another
 * function* asserted them non-null earlier in the call stack).
 *
 * Forwarding the narrowed handles onto `ReadyFrameContext` carries the
 * narrowing across the function boundary.  A pass implementation can
 * read `ctx.galaxyPointRenderer.draw(...)` directly, no `!` needed.
 */

import type { Mat4 } from 'wgpu-matrix';

import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { Vec3 } from '../../math/Vec3';
import type { GalaxyPointRenderer } from '../../rendering/GalaxyPointRenderer';
import type { RenderTargets } from '../../rendering/RenderTargets';
import type { TexturedDiskSubsystem } from '../subsystems/TexturedDiskSubsystem';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';
import type { Slab } from './Slab';

/** The ready case: every per-frame derived value is non-null. */
export type ReadyFrameContext = {
  isReady: true;
  /** Live camera reference. */
  cam: OrbitCamera;
  /** Combined view-projection matrix, computed once per frame. */
  vp: Mat4;
  /**
   * This frame's slab table (`deriveSlabs`) — array position === `Slab.index`.
   * `slabViewOf` resolves a `FrameStep`'s `slab: number` into a `SlabView`
   * by indexing straight into this array.
   */
  slabs: readonly Slab[];
  /** Backing-store-pixel viewport size; same as `canvas.{width,height}`. */
  canvasSize: { width: number; height: number };
  /** Snapshot of `cam.position` as a readonly tuple (no live Float32Array aliasing). */
  drawCamPos: Readonly<Vec3>;
  /** `canvasSize.height / (2·tan(fovY/2))` — pinhole radian→pixel conversion. */
  drawPxPerRad: number;
  /**
   * The frame's stamped clock — `performance.now()`-shaped, taken from
   * `runFrame`'s single wall-clock sample.  Every per-frame-evaluated
   * animated value (fades, load-fade ramps, clip opacity) must read THIS
   * instead of sampling `performance.now()` itself, so a frame-by-frame
   * recorder can substitute a stepped clock at one place and every
   * animation stays a pure function of the stamped time.
   */
  nowMs: number;
  /**
   * This frame's sim-clock instant in Julian days — `deriveSimDays(time, nowMs)`,
   * sampled ONCE by `runFrame` from the time-intent slice before the camera
   * produce step. `sceneBodyStates` evaluates the whole body snapshot at THIS
   * instant, so every per-frame body reader (planets, textured bodies, orbit
   * trails) shares one epoch and can never draw the same body at two positions.
   * A paused clock holds it steady; live/manual playback advances it each frame.
   */
  simDays: number;
  /** Vertical field-of-view in radians (`cam.fovYRad`) — the source `drawPxPerRad` is derived from. */
  fovYRad: number;
  /** Structure-focus recession blend 0→1, from structureFocus.produceFocusUniforms (ticked once/frame). */
  focusBlend: number;
  /**
   * Magnitude (metres) of this frame's cursor-directed zoom-bias eye
   * correction (`surfaceZoomBias.ts`) — 0 whenever the anchor is absent or
   * has cleared on focus change. Debug-only: read by the DebugPanel's Camera
   * section, no production consumer. Optional (rather than required) so the
   * many hand-built `ReadyFrameContext` test fixtures across `tests/` — none
   * of which exercise the zoom-bias path — don't all need updating for a
   * debug-only field; `runFrame` treats an absent value as 0.
   */
  zoomBiasAppliedMeters?: number;
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
  galaxyPointRenderer: GalaxyPointRenderer;
  /**
   * The offscreen render-target table (`hdr`, `volume`, …).  Forwarded
   * here from `state.gpu.renderTargets` — same reference, no allocation —
   * so the executor's `viewFor` and any layer that samples an offscreen
   * (`ctx.renderTargets.viewOf('volume')`) never reach back into `state`.
   */
  renderTargets: RenderTargets;
  /**
   * The set of render-target ids drawn into so far THIS frame. A later pass
   * that samples an earlier target's texture guards on this — mirroring the
   * executor's composite step, which skips compositing a source that was never
   * rendered this frame. The near-field caption occlusion reads it to avoid
   * sampling the `foreground:0` depth on a frame where no body drew (the
   * executor skips an empty render step, leaving that depth stale/uninitialised).
   */
  renderedTargets: ReadonlySet<string>;
  texturedDisks: TexturedDiskSubsystem;
};
