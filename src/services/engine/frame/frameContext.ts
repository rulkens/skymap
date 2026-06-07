/**
 * frameContext — a typed snapshot of "what the world looks like this
 * frame", derived once at the top of `runFrame()` and threaded into
 * `renderFrame()` as a single struct.
 *
 * ### Why a per-frame derived context exists
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
 * That arrangement had three legibility problems:
 *
 *   1. The "is the engine bootstrapped?" question had no single answer
 *      site — every frame redid the 5-way check, and any future call
 *      site that wanted to ask the same question would have to copy-
 *      paste it.
 *   2. `drawPxPerRad` and `drawCamPos` were derived twice on consecutive
 *      lines of execution (runFrame → renderFrame), in different files,
 *      with no link between the two derivations.  Drift was a latent
 *      bug — a future "well, runFrame uses 0.5 fovY/2 because of a
 *      tween" tweak could silently desync the two passes.
 *   3. Type narrowing didn't flow.  Each consumer needed its own
 *      `state.cam!.position` non-null assertion or local guard, even
 *      though the engine was provably-ready by the time the GPU
 *      dispatch ran.
 *
 * The fix is one named struct, derived once at the top of the frame
 * body and consumed by every downstream site that asks "what's the
 * camera doing this frame?".  Adding a new derived per-frame quantity
 * (e.g. frustum planes for culling, or a cached camera-distance scalar)
 * becomes a one-line addition to `ReadyFrameContext`, not a 4-snapshot
 * scatter across two files.
 *
 * ### Why the discriminated union (isReady: true | false)
 *
 * The alternative is `FrameContext | null` — a nullable shape where the
 * caller writes `if (!ctx) return`.  That works structurally, but the
 * named boolean reads better at every call site:
 *
 *   if (!ctx.isReady) {                  // self-describing
 *     state.subsystems.scheduler.requestRender();
 *     return;
 *   }
 *
 *   if (!ctx) return;                    // what does "not ctx" mean?
 *
 * The discriminated union also lets future contributors define helper
 * functions whose argument type is `ReadyFrameContext` instead of
 * `FrameContext`, encoding "this code only runs after the bootstrap
 * gate passed" directly in the type system.  Spec D's later migrations
 * (the `Pass` abstraction, D.2) lean on this — `Pass.draw` takes
 * `ReadyFrameContext`, so the type checker proves the engine was ready
 * when the pass fired without re-asserting the precondition.
 *
 * ### Why `drawCamPos: Readonly<Vec3>` (a tuple)
 *
 * `OrbitCamera.position` is a gl-matrix `vec3`, which under the hood is
 * a `Float32Array`.  Forwarding the live `Float32Array` to downstream
 * passes risks two failure modes: (a) a consumer accidentally mutating
 * an entry (TypedArray writes don't fault), and (b) the camera moving
 * between the snapshot point and the read point inside one frame —
 * possible in principle if a future feature lets a tween advance
 * mid-frame.  Snapshotting to a plain readonly tuple defends against
 * both: the array is small (3 floats — copy is essentially free), the
 * shape is pinned, and the `Readonly<...>` modifier makes attempted
 * writes a tsc error.
 *
 * The Readonly modifier is type-level only — the runtime array is
 * still mutable — but that's fine for the use case.  We're guarding
 * against accidental writes from typo'd code, not malicious mutation;
 * the compile-time error catches the typo before it ships.
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
 *
 * The trade-off is mild type duplication: `ReadyFrameContext` lists
 * fields that also live on `EngineState`.  We accept it because the
 * win at the call site (no re-narrowing) is greater than the cost
 * (one declaration site duplicated).
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { FrameContext } from '../../../@types/engine/frame/FrameContext';
import { computeViewProj } from '../../camera/orbitCamera';
import { isEngineReady } from '../helpers/engineReady';

/**
 * Derive the per-frame context.  Reads the camera + GPU + subsystem
 * fields off `state`, runs the bootstrap gate, and either returns
 * `{ isReady: false }` or computes the four derived values
 * (`vp`, `canvasSize`, `drawCamPos`, `drawPxPerRad`) and returns the
 * fully-populated ready shape.
 *
 * Pure: takes inputs, returns a value, no side effects.  Safe to call
 * on every frame; the cost is a single `computeViewProj` (already paid
 * pre-D.1) plus a 3-element array allocation and a `Math.tan` (which
 * `renderFrame` was already doing).
 */
export function deriveFrameContext(state: EngineState, canvas: HTMLCanvasElement): FrameContext {
  // The bootstrap gate.  Pre-D.1 this lived inline in `runFrame()` as
  // a 5-way `if (!vp || !rendererRef || !camRef || !thumbnailsRef ||
  // !postProcessRef)` check.  D.1 lifted it here; D.4 then routed it
  // through `isEngineReady` so every site that asks "is the engine
  // bootstrapped?" — per-frame, slot-commit, public-handle — funnels
  // through one predicate.  When MSDF labels (or any future
  // bootstrap-only handle) lands, only `isEngineReady` and
  // `ReadyFrameContext`'s field list need updating; this gate stays
  // the same.
  if (!isEngineReady(state)) {
    return { isReady: false };
  }
  const cam = state.cam;
  const renderer = state.gpu.renderer;
  const postProcess = state.gpu.postProcess;
  const volumeOffscreen = state.gpu.volumeOffscreen;
  const texturedDisks = state.subsystems.texturedDisks;

  // Snapshot-derive everything the caller would otherwise compute
  // locally.  `computeViewProj` was previously called in `runFrame`;
  // the `drawCamPos` / `drawPxPerRad` pair was previously computed at
  // the top of `renderFrame` (lines 286-297 pre-D.1).  Both sites now
  // read from `ctx`.
  const canvasSize = { width: canvas.width, height: canvas.height };
  const vp = computeViewProj(cam);
  const drawCamPos: Readonly<Vec3> = [cam.position[0]!, cam.position[1]!, cam.position[2]!];
  const drawPxPerRad = canvasSize.height / (2 * Math.tan(cam.fovYRad / 2));

  // `focusBlend` is seeded to 0 (the at-rest, no-recession value) and then
  // overwritten by `runFrame` with this frame's real blend the moment the
  // ready gate passes. It can't be derived here: computing it ticks the
  // structureFocus fade controller, a side effect that must fire exactly
  // once per frame — and `deriveFrameContext` is deliberately pure (it may
  // be called speculatively, and double-ticking would double-advance the
  // ramp). So the value is a placeholder until `runFrame` fills it in,
  // before any consumer (label director, marker upload, render settings)
  // reads it.
  return {
    isReady: true,
    cam,
    vp,
    canvasSize,
    drawCamPos,
    drawPxPerRad,
    focusBlend: 0,
    renderer,
    postProcess,
    volumeOffscreen,
    texturedDisks,
  };
}
