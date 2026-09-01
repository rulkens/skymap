/**
 * frameContext — a typed snapshot of 'what the world looks like this frame',
 * derived once at the top of `runFrame()` and threaded into `renderFrame()` as
 * a single struct.
 *
 * ### Why a per-frame derived context exists
 *
 * The alternative is free-standing snapshot locals at the top of the frame
 * body — camera, view-proj, renderer, post-process handles — followed by an
 * n-way null check, with each snapshot (plus derived scalars like `drawCamPos`
 * / `drawPxPerRad`) forwarded into `renderFrame()` as separate fields and
 * possibly recomputed there. That arrangement has three legibility problems:
 *
 *   1. The 'is the engine bootstrapped?' question has no single answer site —
 *      every frame redoes the n-way check, and any call site that wants to ask
 *      the same question has to copy-paste it.
 *   2. Derived scalars get computed twice (runFrame → renderFrame), in different
 *      files, with no link between the two derivations. Drift is a latent bug.
 *   3. Type narrowing doesn't flow. Each consumer needs its own non-null
 *      assertion or local guard, even though the engine is provably-ready by the
 *      time the GPU dispatch runs.
 *
 * Instead: one named struct, derived once at the top of the frame body and
 * consumed by every downstream site that asks 'what's the camera doing this
 * frame?'. Adding a new derived per-frame quantity (e.g. frustum planes for
 * culling) is a one-line addition to `ReadyFrameContext`, not a multi-snapshot
 * scatter across two files.
 *
 * ### Why the discriminated union (isReady: true | false)
 *
 * The alternative is `FrameContext | null` — a nullable shape where the caller
 * writes `if (!ctx) return`. That works structurally, but the named boolean
 * reads better at every call site:
 *
 *   if (!ctx.isReady) {                  // self-describing
 *     state.subsystems.scheduler.requestRender();
 *     return;
 *   }
 *
 *   if (!ctx) return;                    // what does 'not ctx' mean?
 *
 * The discriminated union also lets helper functions take `ReadyFrameContext`
 * instead of `FrameContext`, encoding 'this code only runs after the bootstrap
 * gate passed' directly in the type system.
 *
 * ### Why `drawCamPos: Readonly<Vec3>` (a tuple)
 *
 * `OrbitCamera.position` is a mutable `Vec3` tuple, updated in place by
 * `updatePosition`. Forwarding the live array to downstream passes risks
 * two failure modes: (a) a consumer accidentally mutating an entry (array
 * writes don't fault), and (b) the camera moving between the snapshot point and
 * the read point inside one frame. Snapshotting to a plain readonly tuple
 * defends against both: the array is small (3 floats — copy is essentially
 * free), the shape is pinned, and the `Readonly<...>` modifier makes attempted
 * writes a tsc error.
 *
 * ### Why the GPU handles ride along on the ready context
 *
 * `state.gpu.galaxyPointRenderer`, `state.gpu.renderTargets`, and `state.subsystems.thumbnails`
 * are all part of the 5-way bootstrap gate. Once the gate passes, downstream
 * code wants to use those handles without re-checking they're non-null — but if
 * we left them on `state.gpu.*` and `state.subsystems.*`, every consumer would
 * have to re-narrow them locally (since TS can't track that another function
 * asserted them non-null earlier in the call stack).
 *
 * Forwarding the narrowed handles onto `ReadyFrameContext` carries the narrowing
 * across the function boundary. A pass implementation can read
 * `ctx.galaxyPointRenderer.draw(...)` directly, no `!` needed.
 *
 * The trade-off is mild type duplication: `ReadyFrameContext` lists fields that
 * also live on `EngineState`. We accept it because the win at the call site (no
 * re-narrowing) is greater than the cost (one declaration site duplicated).
 *
 * ### Why `pose` and `projection` are passed in (the threaded-pose variant)
 *
 * `runFrame` produces the pose once (for the tween-completion check and the
 * commit-on-edge gate), then passes the already-produced `pose` and the live
 * `projection` into `deriveFrameContext`. This avoids calling `runCameraDrivers`
 * a second time (which would advance the clock twice on the same frame — the
 * clock is idempotent for the same descriptor reference, but two calls is still
 * conceptually wrong). `deriveFrameContext` is therefore side-effect-free again:
 * it only calls `assembleOrbitCamera(pose, projection, poseBasis, upBasis)`,
 * `computeViewProj`, and `deriveSlabs` to build the frame's slab table.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { FrameContext } from '../../../@types/engine/frame/FrameContext';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import type { FramedCameraPose } from '../../../@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { BodyPoseProvider } from '../../../@types/engine/camera/BodyPoseProvider';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import { computeViewProj } from '../../../utils/camera/computeViewProj';
import { imagePlaneBasis } from '../../../utils/camera/imagePlaneBasis';
import { frameUp } from '../../../utils/camera/frameUp';
import { normalize3 } from '../../../utils/math/normalize3';
import { mat3FromColumns } from '../../../utils/math/mat3FromColumns';
import { starSphereRangeM } from '../../../utils/scene/starSphereRangeM';
import { isEngineReady } from '../helpers/engineReady';
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { bodyRelativePose } from '../camera/bodyRelativePose';
import { poseFromBodyArm } from '../../../utils/camera/poseFromBodyArm';
import { pivotRadiusMpc } from '../camera/pivotRadiusMpc';
import { ZERO_FOCUS } from '../subsystems/structureFocusSubsystem';
import { deriveSlabs } from './slabs';
import { deriveBodyStates } from './deriveBodyStates';
import { visibleSlabBodies } from './visibleSlabBodies';
import { SCENE_ANCHOR_POINT_BODIES } from '../../../data/bodies/sceneAnchorPointBodies';
import { visibleStars } from './visibleStars';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from './partitionStarsByResolution';

/**
 * Derive the per-frame context from an already-produced pose and projection.
 *
 * `pose` is the pose that `runFrame` produced earlier in the same frame (via
 * `runCameraDrivers`); `projection` is the live engine Resource that carries
 * fovYRad, aspect, near, and far; `poseBasis` and `upBasis` are this frame's
 * two orientation bases, forwarded straight into `assembleOrbitCamera`:
 * `poseBasis` (the committed `ORIENTATION_FRAMES[orientation]`, which does not
 * move during a roll) decodes the eye position, `upBasis` (the live, possibly
 * mid-slerp `resolveFrameBasis` result) decodes screen-up. Splitting them here
 * is what makes an orientation-frame switch roll the horizon instead of
 * sweeping the whole view — see `runFrame`'s basis-resolution block for why
 * each reader gets the value it gets.
 *
 * The bootstrap gate still reads `state.cam` for non-null (it is non-null once
 * `wireInput` runs); `state.cam` is the drag register, NOT the source of the
 * rendered pose. The produced `ctx.cam` is a fresh assembled camera that does
 * NOT alias `state.cam`.
 *
 * Side-effect-free: the clock is advanced by `runFrame`'s produce step, not
 * here. Safe to call speculatively; a second call in the same frame is a no-op
 * on clock state.
 *
 * `nowMs` is runFrame's single wall-clock sample, stamped onto the ready
 * context so every animated consumer reads the frame clock instead of
 * sampling `performance.now()` itself — the seam a frame-by-frame recorder
 * needs to step time deterministically.
 *
 * `simDays` is the frame's sim-clock instant (Julian days), derived by
 * `runFrame` from the time-intent slice before the camera produce step and
 * stamped here so `sceneBodyStates` evaluates the body snapshot at one agreed
 * epoch every reader shares. It is a separate axis from `nowMs`: `nowMs` is
 * wall-clock (drives fades and ramps), `simDays` is scene time (drives where
 * the planets are), and the two decouple whenever the clock is paused or
 * scrubbed.
 *
 * `arm` is the SAME framed pose `pose` was resolved from (`resolveWorldArm`,
 * called once by the caller — never here, so a frame never resolves twice).
 * It exists only for the pose-provider seam below (spec §5.2): everything
 * else in this function reads `pose`/`projection`/the bases, never `arm`.
 */
export function deriveFrameContext(
  state: EngineState,
  canvas: HTMLCanvasElement,
  pose: CameraPose,
  arm: FramedCameraPose,
  projection: CameraProjection,
  poseBasis: Mat3,
  upBasis: Mat3,
  visibleSourceMask: number,
  nowMs: number,
  simDays: number,
): FrameContext {
  // The bootstrap gate. Every site that asks 'is the engine bootstrapped?' —
  // per-frame, slot-commit, public-handle — funnels through the one
  // `isEngineReady` predicate. When a new bootstrap-only handle lands, only
  // `isEngineReady` and `ReadyFrameContext`'s field list need updating; this
  // gate stays the same.
  if (!isEngineReady(state)) {
    return { isReady: false };
  }
  const galaxyPointRenderer = state.gpu.galaxyPointRenderer;
  const renderTargets = state.gpu.renderTargets;
  const texturedDisks = state.subsystems.texturedDisks;

  // Assemble the full OrbitCamera from the already-produced store pose, the
  // engine's projection Resource, and this frame's two orientation bases. The
  // bases are written onto the camera before its position is derived: position
  // decodes through `poseBasis` (committed, roll-invariant), every derived
  // quantity below that reads screen-up (vp, slabs) decodes through `upBasis`
  // (live, rolls). The returned camera is a fresh object — it does NOT alias
  // `state.cam` (the drag register) or any frozen store array.
  const cam = assembleOrbitCamera(pose, projection, poseBasis, upBasis);

  // Snapshot-derive everything the caller would otherwise compute locally.
  // `runFrame` and `renderFrame` both read these off `ctx`, so the two
  // derivations can't drift.
  const canvasSize = { width: canvas.width, height: canvas.height };
  const vp = computeViewProj(cam);

  // This frame's ONE R_body(t) sample (spec §4). Called directly rather than
  // via `sceneBodyStates(state, ctx)` because `ctx` does not exist yet at this
  // point in its own derivation; `deriveBodyStates` memoizes one deep on
  // `simDays`, so every later `sceneBodyStates(state, ctx)` call this frame
  // returns this SAME Map by reference — no second cache, no drift.
  const bodyStates = deriveBodyStates(simDays);

  // Computed here (ahead of `visibleSlabBodies`, which needs it for the
  // frustum cull) rather than inline in the pose-provider seam below, so
  // both consumers share one derivation.
  const camForward = normalize3([
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ]);

  const { earth, planets } = state.data.bodies;
  const slabBodyCandidates: readonly SceneBody[] =
    earth === null
      ? [...planets, ...SCENE_ANCHOR_POINT_BODIES]
      : [earth, ...planets, ...SCENE_ANCHOR_POINT_BODIES];

  const visibleBodies = visibleSlabBodies({
    bodies: slabBodyCandidates,
    bodyStates,
    camPosMpc: cam.position,
    camForwardMpc: camForward,
    viewportWidthPx: canvasSize.width,
    viewportHeightPx: canvasSize.height,
    fovYRad: cam.fovYRad,
  });

  // The pose provider seam (spec §5): a closure over provider A
  // (`bodyRelativePose`), built HERE rather than inside `deriveSlabs` so a
  // future provider B (spec 2) swaps in behind the same `BodyPoseProvider`
  // type with `deriveSlabs` untouched. `camBasisWorld` reruns the SAME roll
  // NEAR0's own vp derivation uses (`imagePlaneBasis` is the shared seam both
  // call, not a copy) so a body row's screen orientation matches NEAR0's —
  // reading `cam.roll` here rather than hard-coding 0 is what keeps that true
  // once something sets a non-zero roll (spec 2 §5.2). Forwarded onto
  // `ReadyFrameContext.bodyPose` below (the SAME closure, not a second one) so
  // a body-slab layer's own pose read (`prepareBodySurfaceFrame`) can never
  // drift from the one `slabs` was built from — see that field's doc.
  const { right: camRight, up: camUp } = imagePlaneBasis(
    camForward,
    cam.roll ?? 0,
    frameUp(cam.upBasis),
  );
  const camBasisWorld = mat3FromColumns(camRight, camUp, camForward);
  // Provider B serves ONLY the engaged body, straight from its own stored
  // pose — no Mpc round trip. Every other body, and the whole absolute arm,
  // stay on provider A (spec §5.2, ruled S1: "B keeps A").
  const bodyPose: BodyPoseProvider = (bodyId) => {
    if (arm.frame !== 'absolute' && arm.frame.body === bodyId) {
      return poseFromBodyArm(arm.pose);
    }
    const bodyState = bodyStates.get(bodyId);
    if (bodyState === undefined) return null;
    return bodyRelativePose({ camPosMpc: cam.position, camBasisWorld, bodyState });
  };

  // NEAR0's distanceRangeM (spec §7.1): the star spheres actually drawn this
  // frame, not `foregroundFrustum`'s bracket. `positionedVisibleStars` needs
  // `ctx.simDays` only, so its join is inlined by hand here for the same
  // reason `bodyStates` is called directly above — `ctx` doesn't exist yet.
  const positionedStars = visibleStars(state).map((star) => ({
    ...star,
    positionMpc: bodyStates.get(star.id)!.positionMpc,
  }));
  const { spheres } = partitionStarsByResolution({
    stars: positionedStars,
    camPosMpc: cam.position,
    thresholdPx: STAR_RESOLVE_PX,
    viewportHeightPx: canvasSize.height,
    fovYRad: cam.fovYRad,
  });
  const starRangeM = starSphereRangeM({ spheres, camPosMpc: cam.position });

  // deriveSlabs is called here — alongside vp, not from a separate site —
  // so there is exactly one per-frame derivation of the slab table (see the
  // module header's point 2 on why derived scalars must not be recomputed
  // in two places). The focused pivot's radius (or null) lets the near-field
  // row key its near plane off ALTITUDE rather than raw distance — see
  // `slabs.ts: deriveSlabs`.
  const slabs = deriveSlabs({
    cam,
    cosmoVp: vp,
    pivotRadiusMpc: pivotRadiusMpc(state.selectionRows.focus),
    pose: bodyPose,
    visibleBodies,
    viewportPx: [canvasSize.width, canvasSize.height] as Vec2,
    starSphereRangeM: starRangeM,
  });
  const drawCamPos: Readonly<Vec3> = [cam.position[0]!, cam.position[1]!, cam.position[2]!];
  const drawPxPerRad = canvasSize.height / (2 * Math.tan(cam.fovYRad / 2));

  // `focusBlend` is seeded to 0 (the at-rest, no-recession value) and then
  // overwritten by `runFrame` with this frame's real blend the moment the ready
  // gate passes. It can't be derived here: computing it ticks the structureFocus
  // fade controller, a side effect that must fire exactly once per frame —
  // `deriveFrameContext` is side-effect-free (it may be called speculatively,
  // and double-ticking would double-advance the ramp). So the value is a
  // placeholder until `runFrame` fills it in, before any consumer (label
  // director, marker upload, render settings) reads it.
  //
  // `focus` is seeded to ZERO_FOCUS (blend=0, the at-rest sentinel) and overwritten
  // by `runFrame` with this frame's real FocusUniformsValue the moment the ready
  // gate passes. Same reason as `focusBlend`: `produceFocusUniforms` ticks the
  // focus fade controller — a once-per-frame side effect — so it can't run here.
  // ZERO_FOCUS is a module-private constant in structureFocusSubsystem; importing
  // it avoids duplicating the literal and keeps a single source of truth for the
  // at-rest defaults (blend=0, apparentRadiusMpc=1 so smoothstep edges are
  // never degenerate, everything else a don't-care).
  return {
    isReady: true,
    cam,
    vp,
    slabs,
    bodyPose,
    canvasSize,
    drawCamPos,
    drawPxPerRad,
    nowMs,
    simDays,
    fovYRad: cam.fovYRad,
    focusBlend: 0,
    visibleSourceMask,
    focus: ZERO_FOCUS,
    galaxyPointRenderer,
    renderTargets,
    // A fresh empty Set per frame — the executor populates it as it opens the
    // first pass against each target, and a later pass sampling an earlier
    // target's texture reads it to know whether that target actually rendered
    // this frame. `deriveFrameContext` returns a fresh object each frame, so a
    // new Set here can never leak state across frames.
    renderedTargets: new Set<string>(),
    texturedDisks,
  };
}
