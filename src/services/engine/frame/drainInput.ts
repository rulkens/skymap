/**
 * drainInput — the single per-frame input-apply site: drain the aggregator, fold
 * the steps through `replayInput`, land the results on the runtime and dispatch
 * the fold's actions in order. Runs above the store read the drivers resolve
 * against, so a gesture begun between frames reaches this frame's produce and
 * its commits are in the drivers' snapshot.
 *
 * `beginDrag` / `cancelCameraTween` are dispatched at DOM time by the emit sink, so a
 * cancel cannot outlive the tween a double-click starts in the gap.
 */

import { replayInput } from '../camera/replayInput';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { selectTimeState } from '../../../state/time/selectors';
import { deriveBodyStates } from './deriveBodyStates';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { FollowMemory } from '../../../@types/engine/camera/FollowMemory';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';

export function drainInput(
  state: EngineState,
  deps: RunFrameDeps,
  nowMs: number,
): {
  readonly followDistanceTarget: number | null;
  readonly follow: FollowMemory | null;
} {
  const runtime = state.cameraRuntime;
  const steps = state.subsystems.inputAggregator.drain();
  // The caller assigns the returned memory unconditionally, so a no-input frame
  // hands it straight back rather than nulling it.
  if (steps.length === 0) return { followDistanceTarget: null, follow: runtime.follow };

  const store = deps.cb.store;
  const rootState = store.getState();
  const next = replayInput(
    { register: runtime.lastPose.current, surface: runtime.surface, follow: runtime.follow },
    steps,
    {
      rootState,
      nowMs,
      canvasPx: [deps.canvas.clientWidth || 1, deps.canvas.clientHeight || 1],
      projection: runtime.projection,
      upBasis: runtime.upBasis.current,
      poseBasis: ORIENTATION_FRAMES[state.settings.orientation],
      // This frame's instant; `runFrame` re-derives the same one, memoised.
      bodies: deriveBodyStates(deriveSimDays(selectTimeState(rootState), nowMs)) as ReadonlyMap<
        BodyId,
        BodyState
      >,
      winnerLastFrame: runtime.prevActiveId.current,
      autoRotateEpoch: runtime.epochs.autoRotate,
    },
  );

  runtime.lastPose.current = next.register;
  runtime.surface = next.surface;
  if (next.lastZoomFactor !== null) runtime.lastZoomFactor.current = next.lastZoomFactor;
  // The fold's spin-epoch advance is NOT stored: `advanceEpochs` re-derives the
  // row against the post-dispatch base, which is what the incumbent read did.
  for (const action of next.actions) store.dispatch(action);
  return { followDistanceTarget: next.followDistanceTarget, follow: next.follow };
}
