/**
 * ClipPlayer — the side-effecting Resource that drives the clip's scene cues,
 * owns the `clipOpacity` channel, and manages clip-completion lifecycle.
 *
 * ### Role in the animation architecture
 *
 * `clipPlayer` is a tick-phase Resource, NOT a camera driver. It fires edge-
 * triggered scene cues (fade / show / hide / scene / focus) as elapsed time
 * crosses each cue's `atSec` boundary. The camera pose comes from the clip
 * DRIVER (Task 9 — `evaluateClip`) running in the driver table. `clipPlayer`
 * handles the side-effects the pure evaluator cannot: opacity fades, visibility
 * toggles, settings dispatches, selection focus, and clip-end bookkeeping.
 *
 * ### Eager (no GPU dep)
 *
 * Constructed alongside `structureFocus` in the subsystems literal — before
 * any GPU init. No GPU resources, so it is non-null from t=0 and never
 * requires the `| null` guard that the GPU-owned subsystems carry.
 *
 * ### Destroyable guard
 *
 * `EngineSubsystemHandles._EnforceDestroyable` requires every subsystem to
 * satisfy `Destroyable` (has `destroy(): void`). `clipPlayer.destroy()` resets
 * the `clipOpacity` channel and clears internal bookkeeping — no GPU to free,
 * but the contract must be met.
 */

import type { VisibilityLayerKey } from '../../animation/VisibilityLayerKey';
import type { Destroyable } from '../../rendering/Destroyable';

export type ClipPlayer = {
  /**
   * Per-frame tick. Call BEFORE the camera produce step (Task 12 contract):
   * reads the store for the active clip, fires any due scene cues, advances
   * the clipOpacity channel, and records clip-end for the two-frame deferred
   * completion (see implementation module for the ordering rationale).
   */
  tick(nowMs: number): void;

  /**
   * Stop the active clip immediately: dispatch `endClip()` and reset all
   * internal state (cue cursor, clipOpacity, compile cache). Called when the
   * engine needs to abort a clip without waiting for natural completion —
   * e.g. a `[CANCEL]` hook on the `playClip` Promise pre-empts the tour.
   *
   * `stop()` fires the end-resolver (if registered) AFTER dispatching
   * `endClip()` — the same edge `playClip` uses for natural completion. This
   * ensures cancellation RESOLVES the Promise rather than rejecting it.
   */
  stop(): void;

  /**
   * Register a one-shot callback to invoke when this clip ends, either by
   * natural completion (two-frame deferred `endClip` dispatch in `tick`) or
   * by `stop()`. The callback is fired exactly once and then cleared, so a
   * second call to `registerEndResolver` can register for the NEXT clip.
   *
   * Used by `createPlayClip` to resolve the Promise it returns: when the
   * callback fires the Promise settles, and `yield* call(playClip, clip, frame)`
   * in a saga resumes. Registering BEFORE dispatching `startClip` avoids the
   * narrow race where the clip completes on the same JS microtask.
   */
  registerEndResolver(onEnd: () => void): void;

  /**
   * The clip-owned transient opacity factor for `layer` at `nowMs`.
   *
   * Delegates to the internal `clipOpacity` channel's `factorOf`. Returns 1
   * for any layer the current clip has never touched (the 'unchanged' default).
   * Resets to 1 when the clip ends (both natural completion and `stop()`).
   *
   * The renderer composites this into final alpha:
   *   `finalAlpha = registryFactor × intentBridgeFactor × clipOpacityOf(layer, now)`
   */
  clipOpacityOf(layer: VisibilityLayerKey, nowMs: number): number;
} & Destroyable;
