/**
 * clipPlayer — the impure shell around the pure clip evaluators. Per tick it advances the clip
 * clock, evaluates the scene at t, and hands each change to the subsystem that animates it (the
 * fade registry, the frame roll). It never dispatches the scene: the engine reads it through
 * `view`, an overlay on intent. At the end the play's `atEnd` reverts or commits it (spec S3 §2).
 * A play under transport (S4) takes its clock from `camera.clip.transport` and publishes a jump
 * (a new transport, new data, a wrap) by seeding the registry at t instead of by crossings.
 * Everything happens inside `tick`; nothing is deferred to a later frame. The epoch comes in
 * through `tick` and goes back out, rebased on a loop lap or to a transport's t.
 */

import { compileClip } from '../animation/compileClip';
import { sceneView } from '../animation/sceneView';
import { clipFactorAt } from '../animation/clipFactorAt';
import { countAtOrBefore } from '../../../utils/animation/countAtOrBefore';
import { rampAt } from '../../../utils/animation/rampAt';
import { advanceEpoch, elapsedMs } from '../camera/drivers/cameraEpochs';
import { liveUpBasisQuat } from '../camera/orientation/liveUpBasisQuat';
import { frameRollQuatAt } from '../camera/orientation/frameRollQuatAt';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import { ORIENTATION_FRAME_QUATERNIONS } from '../../../data/orientation/orientationFrames';
import { clipEnded, clearFrameTween, startFrameTween } from '../../../state/camera/cameraSlice';
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
import type { ClipTransport } from '../../../@types/animation/ClipTransport';
import type { TargetChange } from '../../../@types/animation/TargetChange';
import type { FrameTween } from '../../../@types/camera/focusMotion/FrameTween';
import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';
import type { RootState } from '../../../store/types';

const NOTHING_APPLIED: SceneApplied = { steps: 0, focus: 0 };

export function createClipPlayer(deps: ClipPlayerDeps): ClipPlayer {
  const { store, getCameraRuntime, extractFocusRow, syncVisibility, visibilityTargets, getFades } =
    deps;

  // The live play and its scene at t. `applied` is replaced only when a count moves, so its
  // identity keys the view memo.
  let clip: CameraState['clip'] = null;
  let compiled: CompiledClip | null = null;
  let t = 0;
  let held = false;
  let applied = NOTHING_APPLIED;
  let focusRow: FocusRow | null = null;
  // The orientation the last frame roll aimed at (intent's when the play began).
  let publishedFrame: OrientationFrameId | null = null;
  // A transported play's clock: the transport object and the frame time that first saw it.
  let anchor: { readonly transport: ClipTransport; readonly atMs: number } | null = null;
  // The settings after each prefix of the steps, refolded only when the clip or intent moves.
  let prefixMemo: {
    readonly compiled: CompiledClip;
    readonly settings: EngineSettingsState;
    readonly prefixes: readonly EngineSettingsState[];
  } | null = null;

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
  // out, the 1 s frame roll): a revert, or the hand-over to a replacing clip.
  function publishDifference(target: RootState): void {
    syncVisibility(target.settings);
    const frame = target.settings.orientation;
    if (frame !== publishedFrame) rollTo(frame, FRAME_TWEEN_MS, 'easeInOutCubic');
  }

  function prefixSettings(root: RootState): readonly EngineSettingsState[] {
    const { scene } = compiled!;
    if (prefixMemo?.compiled !== compiled || prefixMemo.settings !== root.settings) {
      const prefixes = Array.from(
        { length: scene.steps.length + 1 },
        (_, steps) => sceneView(root, scene, { steps, focus: 0 }, null).settings,
      );
      prefixMemo = { compiled: compiled!, settings: root.settings, prefixes };
    }
    return prefixMemo.prefixes;
  }

  function publishStep(step: SceneStep, index: number, root: RootState): void {
    const { effect } = step;
    if (effect.kind === 'frameTo') {
      rollTo(effect.frame, effect.over * 1000, effect.ease);
      return;
    }
    const over = effect.kind === 'scene' ? undefined : effect.over;
    syncVisibility(prefixSettings(root)[index + 1]!, over === undefined ? undefined : over * 1000);
  }

  // A jump has no crossings: every identity some step touches is set to the value a continuous
  // play shows at t (intent's past the end), and while running its ramp resumes for the time
  // left. Paused, nothing ramps: the registry runs on wall time while the clip clock stands.
  function seed(root: RootState, running: boolean): void {
    const { steps } = compiled!.scene;
    const prefixes = prefixSettings(root);
    const pastEnd = t > compiled!.durationSec;
    const fades = getFades();
    for (const { id, targets } of visibilityTargets(prefixes)) {
      const changes: TargetChange[] = [];
      for (let i = 0; i < steps.length; i++) {
        const to = targets[i + 1]!;
        if (to !== targets[i])
          changes.push({ atSec: steps[i]!.atSec, to, overMs: overMsOf(steps[i]!, to) });
      }
      if (changes.length === 0) continue;
      const ramp = pastEnd ? null : rampAt(targets[0]!, changes, t);
      fades.setImmediate(id, ramp?.value ?? targets[0]!);
      if (running && ramp !== null && ramp.remainingMs > 0) {
        fades.fadeTo(id, ramp.target, ramp.remainingMs);
      }
    }
    const roll = running ? rollAt(prefixes) : null;
    if (roll !== null) store.dispatch(startFrameTween(roll));
    else if (root.camera.frameTween !== null) store.dispatch(clearFrameTween());
    publishedFrame = view(root).settings.orientation;
  }

  // The frame roll a continuous play has in flight at t, restarted from where it stands. Paused
  // seeds take none: a paused frame inside a roll shows its destination (ADR 0017).
  function rollAt(prefixes: readonly EngineSettingsState[]): FrameTween | null {
    const { steps } = compiled!.scene;
    for (let i = applied.steps - 1; i >= 0; i--) {
      const { atSec, effect } = steps[i]!;
      if (effect.kind !== 'frameTo') continue;
      const endSec = atSec + effect.over;
      if (t >= endSec) return null;
      const from = ORIENTATION_FRAME_QUATERNIONS[prefixes[i]!.orientation];
      return {
        fromQuat: frameRollQuatAt(from, effect.frame, effect.ease, (t - atSec) / effect.over),
        to: effect.frame,
        durationMs: (endSec - t) * 1000,
        easing: effect.ease,
      };
    }
    return null;
  }

  // The steps applied at t (none past the end, where the view is intent). False when unmoved,
  // so `applied`'s identity keeps keying the view memo.
  function countApplied(): boolean {
    const { scene, durationSec } = compiled!;
    const steps = t > durationSec ? 0 : countAtOrBefore(scene.steps, t);
    const focus = t > durationSec ? 0 : countAtOrBefore(scene.focus, t);
    if (steps === applied.steps && focus === applied.focus) return false;
    if (focus !== applied.focus) {
      focusRow = focus === 0 ? null : extractFocusRow(scene.focus[focus - 1]!.ref);
    }
    applied = { steps, focus };
    return true;
  }

  // A continuous advance publishes each crossed step; a lap that drops applied steps seeds.
  function evaluate(root: RootState): void {
    const from = applied;
    if (!countApplied()) return;
    if (applied.steps < from.steps) seed(root, true);
    else
      for (let i = from.steps; i < applied.steps; i++)
        publishStep(compiled!.scene.steps[i]!, i, root);
  }

  function compile(next: NonNullable<CameraState['clip']>): void {
    clip = next;
    compiled = compileClip(next.data);
    applied = NOTHING_APPLIED;
    focusRow = null;
    memoRoot = memoView = memoApplied = null;
  }

  // A new play, or the transported play continuing with new data or a new transport (true). A new
  // play replacing a live clip hands its published scene over to the new clip's start and leaves
  // the end resolver to the play that registered it.
  function enter(next: NonNullable<CameraState['clip']>, root: RootState): boolean {
    const continuing =
      clip !== null &&
      next.transport !== null &&
      (next.data === clip.data || next.transport === clip.transport);
    if (continuing) {
      if (next.data === clip!.data) clip = next;
      else compile(next);
      return true;
    }
    const replacing = clip !== null;
    compile(next);
    t = 0;
    anchor = null;
    if (replacing) publishDifference(root);
    else publishedFrame = root.settings.orientation;
    return next.transport !== null;
  }

  // t for a transported play; true when a running loop wrapped this frame. Only a running clock
  // with nowhere to wrap holds at the end; whoever owns the transport decides what happens next.
  function advanceTransport(transport: ClipTransport, nowMs: number): boolean {
    held = false;
    if (transport.kind === 'paused') {
      t = transport.atSec;
      return false;
    }
    const { durationSec } = compiled!;
    const raw = transport.fromSec + (nowMs - anchor!.atMs) / 1000;
    const span =
      transport.loop ??
      (clip!.data.loop && durationSec > 0 ? { startSec: 0, endSec: durationSec } : null);
    if (span !== null && raw >= span.endSec && span.endSec > span.startSec) {
      const lapped = span.startSec + ((raw - span.startSec) % (span.endSec - span.startSec));
      const wrapped = lapped < t;
      t = lapped;
      return wrapped;
    }
    t = Math.min(raw, durationSec);
    held = raw >= durationSec;
    return false;
  }

  function reset(): void {
    clip = null;
    compiled = null;
    pendingEnd = false;
    held = false;
    anchor = null;
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
  // and publishes the difference. The focus commits as a cut: the clip already placed the
  // camera, and a `stop()` from a saga cancel runs the focus tween saga after `clipEnded`,
  // past `suspendDuringClip`.
  function finish(): void {
    const ending = clip;
    if (ending?.atEnd === 'keep') {
      const intent = store.getState();
      const scene = view(intent);
      store.dispatch(mergeSnapshot(captureSettings(scene)));
      if (applied.focus > 0) store.dispatch(updateSelectionFocus(scene.selection.focus, 'cut'));
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
    let jumped = next !== clip && enter(next, root);

    const { transport } = next;
    if (transport !== null) {
      if (anchor?.transport !== transport) {
        anchor = { transport, atMs: nowMs };
        jumped = true;
      }
      const wrapped = advanceTransport(transport, nowMs);
      if (jumped || wrapped) {
        countApplied();
        seed(root, transport.kind === 'running');
      } else evaluate(root);
      // Rebased so the clip driver's elapsed is t; it never ends on its own.
      return { clipEpoch: { ...epoch, startMs: nowMs - t * 1000 } };
    }

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
    if (compiled === null || t > compiled.durationSec) return 1;
    return clipFactorAt(compiled.scene.factors[address], t);
  }

  function clipAt(): { readonly sec: number; readonly held: boolean } | null {
    return clip === null ? null : { sec: t, held };
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

  return { tick, stop, clipOpacityOf, view, clipAt, destroy, registerEndResolver };
}

// A step's own `over`, else the registry's defaults (600 ms in, 100 ms out).
function overMsOf(step: SceneStep, to: number): number {
  const { effect } = step;
  const over = effect.kind === 'show' || effect.kind === 'hide' ? effect.over : undefined;
  if (over !== undefined) return over * 1000;
  return to === 1 ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS;
}
