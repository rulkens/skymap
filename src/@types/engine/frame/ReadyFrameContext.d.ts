/**
 * ReadyFrameContext — the ready case of `FrameContext`: what is true of the
 * FRAME rather than of one view of it. Derived ONCE per frame and held by
 * every `FrameView` BY REFERENCE (never spread, never copied — sharing is what
 * makes the clock, the body-state sample and the stamps one thing rather than
 * N drifting ones). `renderTargets` rides along narrowed from `isEngineReady`'s
 * gate, so a pass reads it with no `!`; the galaxy/textured-disk handles do NOT
 * (D8) — a pass reads those off `state.gpu.*` behind its own null guard.
 */

import type { Mat3 } from '../../math/Mat3';
import type { Vec2 } from '../../math/Vec2';
import type { BodyState } from '../../scene/BodyState';
import type { MeshBody } from '../../scene/MeshBody';
import type { PositionedStar } from '../../scene/PositionedStar';
import type { SceneBody } from '../../scene/SceneBody';
import type { RenderTargets } from '../../rendering/RenderTargets';
import type { FocusUniformsValue } from '../../rendering/FocusUniformsValue';
import type { BodyPoseProvider } from '../camera/BodyPoseProvider';

/** The ready case: every per-frame derived value is non-null. */
export type ReadyFrameContext = {
  isReady: true;
  /**
   * The camera's world-space right | up | forward as columns — the basis every
   * world-frame consumer (`bodyRelativePose`, a `ViewSpec.rotation`) is
   * relative to. Reruns the SAME roll NEAR0's own vp derivation uses
   * (`imagePlaneBasis` is the shared seam both call, not a copy), so a body
   * row's screen orientation matches NEAR0's.
   */
  camBasisWorld: Mat3;
  /**
   * This frame's ONE R_body(t) sample (spec §4). `deriveBodyStates` memoizes
   * one deep on `simDays`, so every later `sceneBodyStates(state, ctx)` call
   * this frame returns this SAME Map by reference — no second cache, no drift.
   * Keyed by the raw orbital-element id string, one level wider than `BodyId`
   * — the boundary `slabs.ts`/`liveWorldPose.ts` already cast at.
   */
  bodyStates: ReadonlyMap<string, BodyState>;
  /**
   * The UN-turned pose provider (spec §5's provider seam), built once here so
   * a body-slab layer's own `bodyRelativePose` read can never drift from the
   * one a slab's `vp` was built from. A layer that re-derives the pose itself
   * (a second `camBasisWorld` computation) is the exact bug this field exists
   * to make impossible. A view turns its output through `viewBodyPose` and
   * publishes that as `FrameView.bodyPose` — the one `deriveSlabs` was fed.
   */
  bodyPose: BodyPoseProvider;
  /**
   * The bodies eligible for a slab row before any view's frustum gate: Earth,
   * the planets, the scene anchors and the mesh bodies that host their own row.
   * Frame-wide because the roster is a store read, not a camera one — a view
   * culls it (`visibleSlabBodies`), it never re-assembles it.
   */
  slabBodyCandidates: readonly SceneBody[];
  /** The full mesh-body roster — a view runs the SAME gate over it to re-admit
   *  the hosts of mesh bodies riding someone else's slab row. */
  meshBodies: readonly MeshBody[];
  /** The visible seeded stars with this frame's positions resolved — a view
   *  partitions them by apparent size (`partitionStarsByResolution`). */
  positionedStars: readonly PositionedStar[];
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
  /** Eye→pivot-surface range NEAR0's bracket is sized from — `FrameContextInput.altitudeMpc`. */
  altitudeMpc: number;
  /** Galaxy-catalog draw mask (deriveSourceMasks(state).draw), this frame. */
  visibleSourceMask: number;
  /**
   * The offscreen render-target table (`hdr`, `volume`, …).  Forwarded
   * here from `state.gpu.renderTargets` — same reference, no allocation —
   * so the executor's `viewFor` and any layer that samples an offscreen
   * (`ctx.snapshot.renderTargets.viewOf('volume')`) never reach back into `state`.
   */
  renderTargets: RenderTargets;
  /** Full cluster-focus uniform value (produceFocusUniforms, ticked once/frame). */
  focus: FocusUniformsValue;
  /** Structure-focus recession blend 0→1, from structureFocus.produceFocusUniforms (ticked once/frame). */
  focusBlend: number;
  /**
   * The Layer `frame` votes of this frame, OR-folded by `runFrame` right after
   * the hooks run, so core asks the question without reaching into a Layer's
   * own subsystems: the sky-capture scheduler reads this. See `LayerFrameVote`.
   */
  layersSettling: boolean;
  /**
   * Live pointer position in texture pixels — `state.picking.cursorTexPx`
   * forwarded, so a pass never reaches back into the picking bag `PassState`
   * deliberately refuses. `null` unless the `terrain-pick-marker` debug overlay
   * is on (its sole reader): the listener only writes it then.
   */
  cursorTexPx: Readonly<Vec2> | null;
};
