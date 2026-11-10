/**
 * clipPlayer — the impure shell around the pure clip evaluators. Per tick it advances the clip
 * clock, evaluates the scene at t, and hands each change to the subsystem that animates it (the
 * fade registry, the frame roll). It never dispatches the scene: the engine reads it through
 * `view`, an overlay on intent. At the end the play's `atEnd` reverts or commits it (spec S3 §2).
 * Everything happens inside `tick`; nothing is deferred to a later frame. The epoch comes in
 * through `tick` and goes back out, rebased on a loop lap.
 */

import { compileClip } from '../animation/compileClip';
import { sceneView } from '../animation/sceneView';
import { clipFactorAt } from '../animation/clipFactorAt';
import { countAtOrBefore } from '../../../utils/animation/countAtOrBefore';
import { advanceEpoch, elapsedMs } from '../camera/drivers/cameraEpochs';
import { liveUpBasisQuat } from '../camera/orientation/liveUpBasisQuat';
import { clipEnded, startFrameTween } from '../../../state/camera/cameraSlice';
import { FRAME_TWEEN_MS } from '../../../state/camera/watchOrientationChangeSaga';
import { mergeSnapshot } from '../../../state/settings/mergeSnapshotAction';
import { setOrientation } from '../../../state/settings/core/orientationSlice';
import { updateSelectionFocus } from '../../../state/selection/selectionSlice';
import { captureSettings } from '../../../state/scene/captureSettings';
import type { ClipPlayer } from '../../../@types/engine/subsystems/ClipPlayer';
import type { ClipPlayerDeps } from '../../../@types/engine/subsystems/ClipPlayerDeps';
import type { CameraEpochs } from '../../../@types/engine/camera/CameraEpochs';
import type { CameraState } from '../../../@types/camera/orbitCamera/CameraState';
import type { CompiledClip } from '../../../@types/animation/compiledClip/CompiledClip';
import type { SceneApplied } from '../../../@types/animation/compiledClip/SceneApplied';
import type { SceneStep } from '../../../@types/animation/compiledClip/SceneStep';
import type { FocusRow } from '../../../@types/animation/compiledClip/FocusRow';
import type { VisibilityAddress } from '../../../@types/animation/VisibilityAddress';
import type { OrientationFrameId } from '../../../@types/camera/orientation/OrientationFrameId';
import type { Ease } from '../../../@types/animation/Ease';
import type { RootState } from '../../../store/types';

const NOTHING_APPLIED: SceneApplied = { steps: 0, focus: 0 };

export function createClipPlayer(deps: ClipPlayerDeps): ClipPlayer {
  const { store, getCameraRuntime, extractFocusRow, syncVisibility } = deps;

  // The live play and its scene at t. `applied` is replaced only when a count moves, so its
  // identity keys the view memo.
  let clip: CameraState['clip'] = null;
  let compiled: CompiledClip | null = null;
  let t = 0;
  let applied = NOTHING_APPLIED;
  let focusRow: FocusRow | null = null;
  // The orientation the last frame roll aimed at (intent's when the play began).
  let publishedFrame: OrientationFrameId | null = null;

  // `tick` runs BEFORE the produce step, so ending on the frame t first reaches the end would
  // let commit-on-edge bake the pre-saturation pose; the end waits one frame.
  let pendingEnd = false;

  // The `playClip` resolver. Fired AFTER `clipEnded()` lands, so the awaiter sees no clip.
  let endResolver: (() => void) | null = null;

  // The view memo: the fold reruns only when intent's three slices or the applied counts move;
  // any other root write re-spreads the folded slices over the new root. Plain fields, not a key
  // array: the engine's getters call `view` hundreds of times a frame.
  let memoApplied: SceneApplied | null = null;
  let memoRoot: RootState | null = null;
  let memoView: RootState | null = null;

  function view(root: RootState): RootState {
    if (compiled === null) return root;
    if (root === memoRoot && applied === memoApplied) return memoView!;
    if (
      memoRoot === null ||
      applied !== memoApplied ||
      root.settings !== memoRoot.settings ||
      root.selection !== memoRoot.selection ||
      root.selectionRows !== memoRoot.selectionRows
    ) {
      memoView = sceneView(root, compiled.scene, applied, focusRow);
    } else {
      const { settings, selection, selectionRows } = memoView!;
      memoView = { ...root, settings, selection, selectionRows };
    }
    memoRoot = root;
    memoApplied = applied;
    return memoView;
  }

  function rollTo(frame: OrientationFrameId, durationMs: number, easing: Ease): void {
    const fromQuat = liveUpBasisQuat(getCameraRuntime());
    store.dispatch(startFrameTween({ fromQuat, to: frame, durationMs, easing }));
    publishedFrame = frame;
  }

  // Everything published so far moves to `target` at the default durations (600 ms in, 100 ms
  // out, the 1 s frame roll): a revert, the hand-over to a replacing clip, a loop lap.
  function publishDifference(target: RootState): void {
    syncVisibility(target.settings);
    const frame = target.settings.orientation;
    if (frame !== publishedFrame) rollTo(frame, FRAME_TWEEN_MS, 'easeInOutCubic');
  }

  // A loop lap's publish, kept apart so a transport can route a wrap through its seed (S4).
  function publishWrap(target: RootState): void {
    publishDifference(target);
  }

  function publishStep(step: SceneStep, index: number, root: RootState): void {
    const { effect } = step;
    if (effect.kind === 'frameTo') {
      rollTo(effect.frame, effect.over * 1000, effect.ease);
      return;
    }
    const asOfStep = sceneView(root, compiled!.scene, { steps: index + 1, focus: 0 }, null);
    const over = effect.kind === 'scene' ? undefined : effect.over;
    syncVisibility(asOfStep.settings, over === undefined ? undefined : over * 1000);
  }

  function evaluate(root: RootState): void {
    const { scene } = compiled!;
    const steps = countAtOrBefore(scene.steps, t);
    const focus = countAtOrBefore(scene.focus, t);
    if (steps === applied.steps && focus === applied.focus) return;
    const from = applied;
    if (focus !== from.focus) {
      focusRow = focus === 0 ? null : extractFocusRow(scene.focus[focus - 1]!.ref);
    }
    applied = { steps, focus };
    if (steps < from.steps) publishWrap(view(root));
    else for (let i = from.steps; i < steps; i++) publishStep(scene.steps[i]!, i, root);
  }

  // A new play. One replacing a live clip hands its published scene over to the new clip's
  // start and leaves the end resolver to the play that registered it.
  function begin(next: NonNullable<CameraState['clip']>, root: RootState): void {
    const replacing = clip !== null;
    clip = next;
    compiled = compileClip(next.data);
    t = 0;
    applied = NOTHING_APPLIED;
    focusRow = null;
    if (replacing) publishDifference(root);
    else publishedFrame = root.settings.orientation;
  }

  function reset(): void {
    clip = null;
    compiled = null;
    pendingEnd = false;
    applied = NOTHING_APPLIED;
    focusRow = null;
    memoRoot = memoView = memoApplied = null;
  }

  function fireEndResolver(): void {
    const cb = endResolver;
    endResolver = null;
    cb?.();
  }

  // `keep` commits the view to intent while the clip is still live (the overlay then equals
  // intent, so nothing is published and ramps in flight carry on); `revert` drops the overlay
  // and publishes the difference. `suspendDuringClip` keeps the committed focus from flying.
  function finish(): void {
    const ending = clip;
    if (ending?.atEnd === 'keep') {
      const intent = store.getState();
      const scene = view(intent);
      store.dispatch(mergeSnapshot(captureSettings(scene)));
      if (applied.focus > 0) store.dispatch(updateSelectionFocus(scene.selection.focus));
      if (scene.settings.orientation !== intent.settings.orientation) {
        store.dispatch(setOrientation(scene.settings.orientation));
      }
    }
    store.dispatch(clipEnded());
    reset();
    if (ending?.atEnd === 'revert') publishDifference(store.getState());
    fireEndResolver();
  }

  function tick(
    clipEpoch: CameraEpochs['clip'],
    nowMs: number,
  ): { readonly clipEpoch: CameraEpochs['clip'] } {
    if (pendingEnd) {
      finish();
      // Advanced against the POST-dispatch clip: the resolver may start the
      // next clip synchronously, and the driver reads this epoch this frame.
      return { clipEpoch: advanceEpoch(clipEpoch, store.getState().camera.clip, nowMs) };
    }

    const root = store.getState();
    const next = root.camera.clip;
    let epoch = advanceEpoch(clipEpoch, next, nowMs);
    if (next === null) return { clipEpoch: epoch };
    if (next !== clip) begin(next, root);

    const { durationSec } = compiled!;
    let elapsedSec = elapsedMs(epoch, nowMs) / 1000;
    if (elapsedSec >= durationSec && next.data.loop && durationSec > 0) {
      // Rebased, not snapped: the overshoot carries into the next lap, so a slow frame costs no
      // drift per cycle. A looping clip ends only via `stop()`.
      elapsedSec %= durationSec;
      epoch = { ...epoch, startMs: nowMs - elapsedSec * 1000 };
    }
    t = Math.min(elapsedSec, durationSec);
    evaluate(root);
    if (elapsedSec >= durationSec && !next.data.loop) pendingEnd = true;
    return { clipEpoch: epoch };
  }

  function stop(): void {
    finish();
  }

  function clipOpacityOf(address: VisibilityAddress): number {
    return compiled === null ? 1 : clipFactorAt(compiled.scene.factors[address], t);
  }

  function destroy(): void {
    reset();
    // Settles an in-flight `playClip` so the awaiter unwinds; the store is left untouched.
    fireEndResolver();
  }

  function registerEndResolver(onEnd: () => void): void {
    // Overwrites: one playClip is in flight per clip, the prior resolver's
    // call site can no longer reach it.
    endResolver = onEnd;
  }

  return { tick, stop, clipOpacityOf, view, destroy, registerEndResolver };
}
