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
 * `state.gpu.renderer`, `state.gpu.postProcess`, and `state.subsystems.thumbnails`
 * are all part of the 5-way bootstrap gate. Once the gate passes, downstream
 * code wants to use those handles without re-checking they're non-null — but if
 * we left them on `state.gpu.*` and `state.subsystems.*`, every consumer would
 * have to re-narrow them locally (since TS can't track that another function
 * asserted them non-null earlier in the call stack).
 *
 * Forwarding the narrowed handles onto `ReadyFrameContext` carries the narrowing
 * across the function boundary. A pass implementation can read
 * `ctx.renderer.draw(...)` directly, no `!` needed.
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
 * it only calls `assembleOrbitCamera(pose, projection)` and `computeViewProj`.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { FrameContext } from '../../../@types/engine/frame/FrameContext';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CameraProjection } from '../../../@types/camera/CameraProjection';
import { computeViewProj } from '../../../utils/camera/computeViewProj';
import { isEngineReady } from '../helpers/engineReady';
import { assembleOrbitCamera } from '../camera/assembleOrbitCamera';
import { ZERO_FOCUS } from '../subsystems/structureFocusSubsystem';

/**
 * Derive the per-frame context from an already-produced pose and projection.
 *
 * `pose` is the pose that `runFrame` produced earlier in the same frame (via
 * `runCameraDrivers`); `projection` is the live engine Resource that carries
 * fovYRad, aspect, near, and far. Together they are merged into a full
 * `OrbitCamera` via `assembleOrbitCamera`, which `computeViewProj` then
 * projects.
 *
 * The bootstrap gate still reads `state.cam` for non-null (it is non-null once
 * `wireInput` runs); `state.cam` is the drag register, NOT the source of the
 * rendered pose. The produced `ctx.cam` is a fresh assembled camera that does
 * NOT alias `state.cam`.
 *
 * Side-effect-free: the clock is advanced by `runFrame`'s produce step, not
 * here. Safe to call speculatively; a second call in the same frame is a no-op
 * on clock state.
 */
export function deriveFrameContext(
  state: EngineState,
  canvas: HTMLCanvasElement,
  pose: CameraPose,
  projection: CameraProjection,
  visibleSourceMask: number,
): FrameContext {
  // The bootstrap gate. Every site that asks 'is the engine bootstrapped?' —
  // per-frame, slot-commit, public-handle — funnels through the one
  // `isEngineReady` predicate. When a new bootstrap-only handle lands, only
  // `isEngineReady` and `ReadyFrameContext`'s field list need updating; this
  // gate stays the same.
  if (!isEngineReady(state)) {
    return { isReady: false };
  }
  const renderer = state.gpu.renderer;
  const postProcess = state.gpu.postProcess;
  const volumeOffscreen = state.gpu.volumeOffscreen;
  const texturedDisks = state.subsystems.texturedDisks;

  // Assemble the full OrbitCamera from the already-produced store pose and the
  // engine's projection Resource. The returned camera is a fresh object — it
  // does NOT alias `state.cam` (the drag register) or any frozen store array.
  const cam = assembleOrbitCamera(pose, projection);

  // Snapshot-derive everything the caller would otherwise compute locally.
  // `runFrame` and `renderFrame` both read these off `ctx`, so the two
  // derivations can't drift.
  const canvasSize = { width: canvas.width, height: canvas.height };
  const vp = computeViewProj(cam);
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
    canvasSize,
    drawCamPos,
    drawPxPerRad,
    fovYRad: cam.fovYRad,
    focusBlend: 0,
    visibleSourceMask,
    focus: ZERO_FOCUS,
    renderer,
    postProcess,
    volumeOffscreen,
    texturedDisks,
  };
}
