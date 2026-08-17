/**
 * clipPlayer — the side-effecting Resource that owns the clip's scene cues,
 * the `clipOpacity` channel, and clip-completion lifecycle.
 *
 * ### Responsibility split: clipPlayer vs the clip driver
 *
 * The clip DRIVER (`evaluateClip` in the driver table, Task 9) is a PURE
 * function: given elapsed seconds, produce a CameraPose. It has no side
 * effects and no mutable state.
 *
 * `clipPlayer` is the IMPURE complement. Each frame it:
 *   1. Reads `camera.clip` from the store (idle if null).
 *   2. Fires any scene cues whose `atSec` falls in `(prevElapsed, elapsed]`.
 *   3. Advances the `clipOpacity` channel (the clip-owned per-layer opacity).
 *   4. Records clip completion for the two-frame deferred `clipEnded` dispatch.
 *
 * ### Why `clock` is injected (rides cameraClock)
 *
 * `clipPlayer` has no wall-clock access — it takes `nowMs` as a parameter
 * and delegates elapsed-seconds computation to `clipElapsed(clock, clip, nowMs)`.
 * The same `CameraClock` instance the driver table uses: reference-identity
 * change detection fires once on the transition frame, keeping the clip start
 * stamp synchronised between the evaluator and the cue-firer.
 *
 * ### Why `getEngineState` is injected
 *
 * `applySceneEffect` takes an `EngineState` argument (for the bridge read path
 * inside `show`/`hide`). The engine state is mutable-in-place (`const state`
 * in `engine.ts`); passing a lazy `() => EngineState` accessor means the cue
 * sees the LIVE state at fire time, not a stale snapshot captured at
 * `createClipPlayer` call time. The same lazy-closure pattern `structureFocus`
 * uses for its `requestRender` dep.
 *
 * ### Two-frame deferred completion — the post-produce safety contract
 *
 * `clipPlayer.tick` is called as the FIRST step of `runFrame` (Task 12),
 * BEFORE the camera produce step runs `evaluateClip`. If `clipEnded()` were
 * dispatched on the SAME frame `elapsed` first reaches `durationSec`, the
 * produce step that same frame would see `camera.clip === null`, the clip
 * driver would be inactive, and commit-on-edge would bake the PREVIOUS frame's
 * pre-saturation pose — a one-frame-stale final pose.
 *
 * The solution: on the frame `elapsed` first reaches `durationSec`, record
 * `pendingEnd = true` (step 8) but do NOT dispatch. The clip stays active, so
 * the produce step runs `evaluateClip` saturated at `durationSec` (the exact
 * held final pose) and `lastPose` captures it. On the NEXT frame, step 1
 * dispatches `clipEnded()` → `camera.clip` goes null → produce's resting driver
 * wins → commit-on-edge (prev='clip', clip.commitsOnEdge=true) bakes `lastPose`
 * = the saturated final pose. This mirrors the tween-completion ordering
 * (`runFrame.ts`: cancel this frame, commit next).
 *
 * NOTE: The Task 11 brief's checkbox title says "dispatches clipEnded the frame
 * the clip reaches durationSec" — that wording is superseded by this contract.
 * The test pins the two-frame defer explicitly.
 *
 * ### Looping (`ClipData.loop`)
 *
 * A looping clip skips the pendingEnd/clipEnded arm entirely: on completion it
 * rewinds `clock.clipStartMs` (keeping the sub-second remainder past
 * `durationSec` so a slow frame doesn't cost drift) and resets `prevElapsed`
 * so top-of-timeline cues re-fire. `clipEnded()` then only fires via `stop()` —
 * the saga's `stopClip` race arm or `takeLatest` cancellation are the only exits.
 */

import { createClipOpacityChannel } from '../../animation/clipOpacityChannel';
import { compileClip } from '../animation/compileClip';
import { clipElapsed } from '../camera/cameraClock';
import { applySceneEffect } from '../../animation/applySceneEffect';
import { clipEnded } from '../../../state/camera/cameraSlice';
import type { ClipPlayer } from '../../../@types/engine/subsystems/ClipPlayer';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';
import type { CameraClock } from '../../../@types/engine/camera/CameraClock';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import type { AppDispatch } from '../../../store/types';
import type { CompiledClip, SceneCue } from '../../../@types/animation/CompiledClip';
import type { ClipData } from '../../../@types/animation/ClipData';

// ---------------------------------------------------------------------------
// Deps shape
// ---------------------------------------------------------------------------

export type ClipPlayerDeps = {
  /**
   * Injected Redux store accessor. The clipPlayer reads `camera.clip` from
   * `getState()` each tick and dispatches `clipEnded()` on completion. A
   * narrow stub (`{ getState, dispatch }`) is sufficient — the full AppStore
   * type is satisfied by this shape at the engine wiring site.
   */
  store: { getState(): RootState; dispatch: AppDispatch };

  /**
   * Wake the render scheduler. Called after firing a `fade` cue so the frame
   * loop stays alive for the fade ramp, even if no other activity is present.
   */
  requestRender: () => void;

  /**
   * The engine's shared camera clock. `clipElapsed(clock, clip, nowMs)` returns
   * elapsed SECONDS for the active clip, keyed on the clip's reference identity
   * — the same identity the clip driver uses. Injecting the clock instead of
   * calling `performance.now()` keeps tick deterministic and testable.
   */
  clock: CameraClock;

  /**
   * Lazy accessor for the live EngineState. `applySceneEffect` needs the current
   * state (for the bridge's `syncVisibilityFades` read). A closure accessor
   * rather than a snapshot ensures the cue sees the current state at fire time.
   */
  getEngineState: () => EngineState;
};

// ---------------------------------------------------------------------------
// Compile memoisation cache
// ---------------------------------------------------------------------------

type CompileCache = {
  data: ClipData;
  compiled: CompiledClip;
};

// ---------------------------------------------------------------------------
// createClipPlayer
// ---------------------------------------------------------------------------

/**
 * Create a `ClipPlayer` Resource from its dependencies.
 *
 * The returned object is the sole mutable owner of:
 *   - `prevElapsed` — cue-firing cursor (seconds), initialised to -Infinity
 *     so a cue at atSec=0 fires on the clip's arrival frame.
 *   - `pendingEnd` — set true on the frame completion is first detected;
 *     cleared and `clipEnded()` dispatched on the following frame (see the
 *     two-frame deferred completion rationale in the module header above).
 *   - `compileCache` — last-seen `{ data, compiled }` pair, keyed by
 *     reference identity so recompilation is O(1) on steady frames.
 *   - `clipOpacity` — the `ClipOpacityChannel` (one FadeController per
 *     `VisibilityLayerKey`, lazily created on first `fadeTo`).
 */
export function createClipPlayer(deps: ClipPlayerDeps): ClipPlayer {
  const { store, requestRender, clock, getEngineState } = deps;

  // The clipOpacity channel: one private FadeController per VisibilityLayerKey,
  // lazily created on the first fadeTo. Default factor = 1 (untouched layers).
  const clipOpacity = createClipOpacityChannel();

  // Cue-cursor: the elapsed (in seconds) up to which cues have been fired.
  // Initialised to -Infinity so a cue at atSec=0 fires on the arrival frame
  // (the first tick where elapsed crosses from -Infinity to ≥0).
  let prevElapsed = -Infinity;

  // Two-frame completion defer: true after the frame where elapsed first
  // reaches durationSec. On the NEXT tick, clipEnded() is dispatched.
  let pendingEnd = false;

  // Last-seen compile cache: recompile only when clip.data changes by reference.
  let compileCache: CompileCache | null = null;

  // One-shot Promise resolver registered by `playClip` (Plan B). Fires on
  // BOTH clip-end edges (natural deferred completion in tick step 1 and stop).
  // Cleared immediately after firing so the slot is free for the next clip.
  // Lives outside resetState intentionally — resetState clears playback
  // bookkeeping; the resolver is a caller-owned Promise handle, not playback
  // state, and must fire AFTER clipEnded() so the Promise settles with the
  // correct store shape already in place.
  let endResolver: (() => void) | null = null;

  // ── helpers ──────────────────────────────────────────────────────────────

  function getCompiled(data: ClipData): CompiledClip {
    if (compileCache === null || compileCache.data !== data) {
      compileCache = { data, compiled: compileClip(data) };
    }
    return compileCache.compiled;
  }

  function resetState(): void {
    pendingEnd = false;
    prevElapsed = -Infinity;
    clipOpacity.reset();
    compileCache = null;
    // NOTE: endResolver is deliberately NOT cleared here — fireEndResolver
    // clears it after invoking it. Clearing here would race the fire call.
  }

  // Fire the registered end-resolver exactly once, then clear the slot.
  // Called right AFTER each store.dispatch(clipEnded()) to ensure the Promise
  // resolves with the up-to-date store (clip === null) already in place.
  function fireEndResolver(): void {
    const cb = endResolver;
    endResolver = null;
    cb?.();
  }

  function fireCue(cue: SceneCue, nowMs: number): void {
    const { effect } = cue;
    if (effect.kind === 'fade') {
      // The fade verb is clipPlayer's own: write the clipOpacity channel directly.
      // Never route through applySceneEffect (it throws on 'fade').
      for (const layer of effect.layers) {
        // effect.over is SECONDS; fadeTo expects durationMs (milliseconds).
        clipOpacity.fadeTo(layer, effect.to, effect.over * 1000, nowMs);
      }
      // Wake the render loop so the fade ramp actually gets drawn.
      requestRender();
    } else {
      // All other verbs (show / hide / scene / focus) route through the
      // verb→side-effect dispatch table. applySceneEffect throws on 'fade',
      // so the branch above is the complete guard.
      applySceneEffect(effect, { state: getEngineState(), store });
    }
  }

  // ── ClipPlayer API ───────────────────────────────────────────────────────

  function tick(nowMs: number): void {
    // Step 1 — deferred completion: if we recorded pendingEnd on a prior
    // frame, dispatch clipEnded NOW (before reading the new clip state), then
    // reset and return. This is the post-produce-safe exit: the produce step
    // on the PRIOR frame ran evaluateClip saturated at durationSec and baked
    // the final pose into lastPose. Now that clipEnded() fires, commit-on-edge
    // will capture that pose on this frame's produce edge.
    if (pendingEnd) {
      store.dispatch(clipEnded());
      resetState();
      // Resolve the playClip Promise (if any) AFTER clipEnded() has landed in the
      // store, so the Promise settler sees camera.clip === null immediately.
      fireEndResolver();
      return;
    }

    // Step 2 — idle guard: no clip active, nothing to tick.
    const clip = store.getState().camera.clip;
    if (clip === null) return;

    // Step 3 — memoised compile: recompile only when data reference changes.
    const compiled = getCompiled(clip.data);

    // Step 4 — elapsed in SECONDS from the shared camera clock.
    const elapsed = clipElapsed(clock, clip, nowMs);

    // Step 5 — advance the clipOpacity channel's bookkeeping.
    clipOpacity.tick(nowMs);

    // Step 6 — fire scene cues in (prevElapsed, elapsed], ascending atSec.
    // compiled.cues is already sorted ascending by atSec (compileClip sorts).
    for (const cue of compiled.cues) {
      if (cue.atSec > prevElapsed && cue.atSec <= elapsed) {
        fireCue(cue, nowMs);
      }
    }

    // Step 7 — advance the cue cursor.
    prevElapsed = elapsed;

    // Step 8 — completion detection: record pendingEnd on the frame elapsed
    // first reaches durationSec. DO NOT dispatch clipEnded this frame — the
    // produce step must still run evaluateClip saturated at durationSec to
    // bake the correct final pose. clipEnded dispatches on the NEXT tick (step 1).
    if (elapsed >= compiled.durationSec) {
      if (clip.data.loop) {
        // Looping clip: rewind instead of ending. Keep the remainder past
        // durationSec (rather than snapping to 0) so a slow frame doesn't cost
        // a few ms of drift every cycle. Writing clock.clipStartMs directly
        // (bypassing clipElapsed's own ref-change reset) is safe because the
        // clip reference is unchanged — the next clipElapsed(clock, clip, nowMs)
        // call sees clip === clock.lastClipRef and just reads the value we set.
        const overshoot = elapsed - compiled.durationSec;
        clock.clipStartMs = nowMs - overshoot * 1000;
        // Rewind the cue cursor too, so cues at the top of the timeline (e.g. an
        // atSec=0 fade) re-fire on the next pass instead of staying "already fired".
        prevElapsed = -Infinity;
      } else {
        pendingEnd = true;
      }
    }
  }

  function stop(): void {
    // Abort the active clip immediately: dispatch clipEnded, then clean up so
    // the next tick starts from a blank slate. clipOpacity.reset() snaps
    // every faded layer back to factor 1.
    store.dispatch(clipEnded());
    resetState();
    // Resolve the playClip Promise (if any) on the abort edge — the [CANCEL]
    // hook on the returned Promise calls stop(), so this makes cancellation
    // RESOLVE rather than reject (no try/catch needed at call sites).
    fireEndResolver();
  }

  function clipOpacityOf(layer: VisibilityLayerKey, nowMs: number): number {
    return clipOpacity.factorOf(layer, nowMs);
  }

  function destroy(): void {
    // No GPU resources to free. Reset channel and bookkeeping to leave a
    // clean state in case the subsystem bag is inspected after destroy.
    clipOpacity.reset();
    compileCache = null;
    pendingEnd = false;
    prevElapsed = -Infinity;
    // Settle any in-flight playClip Promise so an awaiter unwinds on teardown
    // rather than hanging forever. Unlike stop(), this doesn't dispatch clipEnded
    // because destroy() intentionally leaves the store untouched.
    fireEndResolver();
  }

  function registerEndResolver(onEnd: () => void): void {
    // Overwrites any previously registered resolver. In normal usage only one
    // playClip call is in flight per clip, so overwriting is a safety valve
    // rather than an expected code path (e.g. if a prior Promise was abandoned
    // without being awaited). The prior resolver is simply replaced — it was
    // already unreachable by the call site that created it.
    endResolver = onEnd;
  }

  return { tick, stop, clipOpacityOf, destroy, registerEndResolver };
}
