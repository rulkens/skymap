/**
 * ReadyFrameContext — the discriminated-ready case of `FrameContext`, one
 * named struct derived once at the top of the frame body for every
 * downstream site that asks "what's the camera doing this frame?". `renderTargets`
 * rides along narrowed (from `isEngineReady`'s gate) so a pass reads
 * `ctx.renderTargets` with no `!`; the galaxy/textured-disk handles do NOT
 * (D8) — a pass reads those off `state.gpu.*` behind its own null guard,
 * the convention `ContentPass.d.ts` states.
 */

import type { Mat4 } from 'wgpu-matrix';

import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { Vec3 } from '../../math/Vec3';
import type { RenderTargets } from '../../rendering/RenderTargets';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';
import type { Slab } from './Slab';
import type { BodyPoseProvider } from '../camera/BodyPoseProvider';

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
  /**
   * The SAME pose-provider closure `deriveSlabs` was fed to build `slabs`
   * (spec §5's provider seam) — `frameContext.ts` builds it once, here and
   * for `deriveSlabs`, so a body-slab layer's own `bodyRelativePose` read
   * can never drift from the one the slab's `vp` was built from. A layer
   * that re-derives the pose itself (a second `camBasisWorld` computation)
   * is the exact bug this field exists to make impossible: correct today by
   * coincidence, wrong the moment a future pose provider swaps in behind
   * `BodyPoseProvider` and this ctx field doesn't move with it.
   */
  bodyPose: BodyPoseProvider;
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
  /**
   * Which physical GPU destination this frame's draws land in: `0` = the
   * main view, and a capture row's six faces claim
   * `viewSlotBase … viewSlotBase + 5` (`cubemapFaceContext`, keyed per row in
   * `src/data/rendering/cubemapCaptures.ts`). A capture sweep records several `draw()` calls
   * against DIFFERENT synthetic contexts before one `submit()` — the
   * `queue.writeBuffer`-before-`submit` landmine (docs/RENDERER.md #1) means a
   * renderer-owned buffer shared across those calls would keep only the LAST
   * write. A roster renderer keys its per-frame writes on this field (via a
   * view-slot buffer helper, `src/utils/gpu/`) instead of overwriting one
   * shared destination, so each call's bytes survive to its own draw.
   * `deriveFrameContext` stamps `0`; only `cubemapFaceContext` stamps a
   * face slot.
   */
  viewSlot: number;
  /** Structure-focus recession blend 0→1, from structureFocus.produceFocusUniforms (ticked once/frame). */
  focusBlend: number;
  /**
   * The Layer `frame` votes of this frame, OR-folded by `runFrame` right after
   * the hooks run, so core asks the question without reaching into a Layer's
   * own subsystems: the sky-capture scheduler reads this. See `LayerFrameVote`.
   */
  layersSettling: boolean;
  /** Galaxy-catalog draw mask (deriveSourceMasks(state).draw), this frame. */
  visibleSourceMask: number;
  /** Full cluster-focus uniform value (produceFocusUniforms, ticked once/frame). */
  focus: FocusUniformsValue;
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
};
