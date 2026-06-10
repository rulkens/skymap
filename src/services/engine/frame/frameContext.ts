/**
 * frameContext — a typed snapshot of "what the world looks like this
 * frame", derived once at the top of `runFrame()` and threaded into
 * `renderFrame()` as a single struct.
 *
 * ### Why a per-frame derived context exists
 *
 * The alternative is free-standing snapshot locals at the top of the
 * frame body — camera, view-proj, renderer, post-process handles —
 * followed by an n-way null check, with each snapshot (plus derived
 * scalars like `drawCamPos` / `drawPxPerRad`) forwarded into
 * `renderFrame()` as separate fields and possibly recomputed there.
 * That arrangement has three legibility problems:
 *
 *   1. The "is the engine bootstrapped?" question has no single answer
 *      site — every frame redoes the n-way check, and any call site
 *      that wants to ask the same question has to copy-paste it.
 *   2. Derived scalars get computed twice (runFrame → renderFrame), in
 *      different files, with no link between the two derivations.
 *      Drift is a latent bug — a "runFrame uses 0.5 fovY/2 because of
 *      a tween" tweak could silently desync the two passes.
 *   3. Type narrowing doesn't flow.  Each consumer needs its own
 *      `state.cam!.position` non-null assertion or local guard, even
 *      though the engine is provably-ready by the time the GPU
 *      dispatch runs.
 *
 * Instead: one named struct, derived once at the top of the frame
 * body and consumed by every downstream site that asks "what's the
 * camera doing this frame?".  Adding a new derived per-frame quantity
 * (e.g. frustum planes for culling, or a cached camera-distance scalar)
 * is a one-line addition to `ReadyFrameContext`, not a multi-snapshot
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
 * The discriminated union also lets helper functions take
 * `ReadyFrameContext` instead of `FrameContext`, encoding "this code
 * only runs after the bootstrap gate passed" directly in the type
 * system.  The `Pass` abstraction leans on this — `Pass.draw` takes
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
 * on every frame; the cost is a single `computeViewProj` plus a
 * 3-element array allocation and a `Math.tan`.
 */
export function deriveFrameContext(state: EngineState, canvas: HTMLCanvasElement): FrameContext {
  // The bootstrap gate.  Every site that asks "is the engine
  // bootstrapped?" — per-frame, slot-commit, public-handle — funnels
  // through the one `isEngineReady` predicate.  When a new
  // bootstrap-only handle lands, only `isEngineReady` and
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
  // locally.  `runFrame` and `renderFrame` both read these off `ctx`,
  // so the two derivations can't drift.
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
