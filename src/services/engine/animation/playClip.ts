/**
 * playClip — the non-reactive seam between clip authoring and the animation
 * runtime.
 *
 * ### Why a factory
 *
 * `playClip(clip, frame): Promise<void>` needs three injected deps (store.dispatch,
 * clipPlayer, and a live-pose accessor) that are only available once the engine
 * has bootstrapped. A factory `createPlayClip(deps)` captures them in a closure
 * and returns the bound `playClip` function. Callers (sagas or imperative spikes)
 * receive the plain `(clip, frame) => Promise<void>` with no dep-plumbing at the
 * call site. `frame` is the caller's orientation at dispatch time — pinned onto
 * `camera.clip` (see cameraSlice.ts), never re-derived.
 *
 * ### Promise resolution contract
 *
 * The returned Promise resolves on BOTH clip-end edges — natural completion (the
 * two-frame deferred `endClip` dispatch in `clipPlayer.tick`) and abort
 * (`clipPlayer.stop()` via the `[CANCEL]` hook). It never rejects, so
 * `yield* call(playClip, clip, frame)` in a saga needs no try/catch, and a bare
 * `await playClip(clip, frame)` in an imperative spike is always safe.
 *
 * ### 'live' resolution and fresh-reference invariant
 *
 * `resolveClipStart` is called AT DISPATCH TIME, not at authoring time. This
 * has two effects:
 *   1. `start: 'live'` (or `undefined`) is replaced with the actual pose the
 *      user currently sees (`getLivePose()`), so `evaluateClip` stays pure with
 *      no sentinel values.
 *   2. The returned object is always a FRESH spread (`{ ...data, start }`), even
 *      when `start` was already concrete. The fresh reference is the clock-reset
 *      trigger: `clipElapsed` in `clipPlayer.tick` keys on `camera.clip` reference
 *      identity; a new object reference guarantees the clock resets to zero on the
 *      transition frame, regardless of whether the clip content changed.
 *
 * ### [CANCEL] hook
 *
 * redux-saga invokes `p[CANCEL]()` when a task that called `yield call(p)` is
 * cancelled (e.g. a `race` whose sibling wins). The hook calls `clipPlayer.stop()`,
 * which dispatches `endClip()` and fires the registered end-resolver. Because the
 * resolver fires on the cancel edge too, the Promise resolves (not rejects) and
 * the saga unwinds cleanly without an error boundary.
 */

import { CANCEL } from 'redux-saga';

import { resolveClipStart, clipStarted } from '../../../state/camera/cameraSlice';
import type { ClipData } from '../../../@types/animation/ClipData';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { OrientationFrameId } from '../../../@types/camera/OrientationFrameId';
import type { AppDispatch } from '../../../store/types';
import type { ClipPlayer } from '../../../@types/engine/subsystems/ClipPlayer';

// ---------------------------------------------------------------------------
// Deps shape
// ---------------------------------------------------------------------------

export type PlayClipDeps = {
  /**
   * Narrow store accessor — only `dispatch` is needed. The full AppStore
   * satisfies this shape at the wiring site without exposing the state accessor
   * to this module (playClip is write-only toward the store).
   */
  store: { dispatch: AppDispatch };

  /**
   * The running clip player. `registerEndResolver` is called before dispatching
   * `startClip` to avoid the (theoretical) race where a zero-duration clip
   * completes synchronously. `stop()` is invoked by the `[CANCEL]` hook.
   */
  clipPlayer: Pick<ClipPlayer, 'stop' | 'registerEndResolver'>;

  /**
   * Accessor for the live produced camera pose. Reads
   * `state.cameraRuntime.lastPose.current` (the pose the user actually sees,
   * not the potentially-stale `camera.base`).
   *
   * A closure accessor (not the pose value itself) so 'live' resolution always
   * captures the pose at dispatch time rather than at factory-creation time.
   */
  getLivePose: () => CameraPose;
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create the bound `playClip` function from its engine dependencies.
 *
 * Call once at engine bootstrap after the store, clipPlayer, and camera runtime
 * are all available. The returned function can be handed to sagas via
 * `setSagaContext` or called directly in imperative spikes.
 */
export function createPlayClip(
  deps: PlayClipDeps,
): (clip: ClipData, frame: OrientationFrameId) => Promise<void> {
  const { store, clipPlayer, getLivePose } = deps;

  return function playClip(clip: ClipData, frame: OrientationFrameId): Promise<void> {
    // Resolve 'live' → concrete at DISPATCH TIME (not authoring time) and wrap
    // in a fresh object to trigger the clipElapsed clock reset.
    const resolvedClip = resolveClipStart(clip, getLivePose());

    // Build the Promise first and register its resolver with the clip player
    // BEFORE dispatching clipStarted. This ordering is defensive: if a
    // zero-duration clip somehow completes synchronously the resolver is already
    // in place when clipEnded fires.
    const p = new Promise<void>((resolve) => {
      clipPlayer.registerEndResolver(resolve);
    });

    // Attach the redux-saga [CANCEL] hook. When a saga task is cancelled (e.g.
    // by a race sibling), the middleware calls p[CANCEL](). stop() dispatches
    // clipEnded() and fires the resolver → Promise resolves, never rejects.
    (p as Promise<void> & { [CANCEL]: () => void })[CANCEL] = () => {
      clipPlayer.stop();
    };

    // Activate the clip@95 driver. The fresh `resolvedClip` reference triggers
    // the clipElapsed clock reset on the first tick. `frame` is pinned here —
    // the caller's orientation AT DISPATCH TIME — so a later orientation switch
    // re-expresses the clip's pose instead of reinterpreting it (see the clip
    // row in cameraDrivers.ts).
    store.dispatch(clipStarted({ data: resolvedClip, frame }));

    return p;
  };
}
