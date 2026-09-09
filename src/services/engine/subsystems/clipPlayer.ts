/**
 * clipPlayer — the impure complement of the pure clip driver: per tick it fires
 * the scene cues whose `atSec` falls in `(prevElapsed, elapsed]`, advances the
 * `clipOpacity` channel, and runs clip-completion lifecycle. It holds no
 * reference to the camera runtime: the clip epoch comes in through `tick` and
 * goes back out, rebased on a loop wrap.
 */

import { createClipOpacityChannel } from '../../animation/clipOpacityChannel';
import { compileClip } from '../animation/compileClip';
import { advanceEpoch, elapsedMs } from '../camera/cameraEpochs';
import { applySceneEffect } from '../../animation/applySceneEffect';
import { clipEnded } from '../../../state/camera/cameraSlice';
import type { ClipPlayer } from '../../../@types/engine/subsystems/ClipPlayer';
import type { CameraEpochs } from '../../../@types/engine/camera/CameraEpochs';
import type { VisibilityLayerKey } from '../../../@types/animation/VisibilityLayerKey';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { RootState } from '../../../store/types';
import type { AppDispatch } from '../../../store/types';
import type { CompiledClip, SceneCue } from '../../../@types/animation/CompiledClip';
import type { ClipData } from '../../../@types/animation/ClipData';

export type ClipPlayerDeps = {
  /** A narrow `{ getState, dispatch }` stub satisfies this at the wiring site. */
  store: { getState(): RootState; dispatch: AppDispatch };
  /** Wakes the loop after a `fade` cue so the ramp is drawn. */
  requestRender: () => void;
  /**
   * Lazy, not a snapshot: `applySceneEffect` must see the live `EngineState`
   * at fire time (the bridge read inside `show`/`hide`).
   */
  getEngineState: () => EngineState;
};

type CompileCache = {
  data: ClipData;
  compiled: CompiledClip;
};

export function createClipPlayer(deps: ClipPlayerDeps): ClipPlayer {
  const { store, requestRender, getEngineState } = deps;

  const clipOpacity = createClipOpacityChannel();

  // Cue cursor, SECONDS. -Infinity so a cue at atSec=0 fires on the arrival frame.
  let prevElapsed = -Infinity;

  // Two-frame deferred completion: `tick` runs BEFORE the produce step, so a
  // `clipEnded` on the frame elapsed first reaches `durationSec` would leave the
  // clip driver inactive that same frame and commit-on-edge would bake the
  // PRE-saturation pose. Instead this latches, the produce step runs saturated
  // and `lastPose` captures the held final pose; the NEXT tick dispatches.
  let pendingEnd = false;

  let compileCache: CompileCache | null = null;

  // The `playClip` Promise resolver. Not cleared by `resetState`: it must fire
  // AFTER `clipEnded()` lands so the awaiter sees `camera.clip === null`.
  let endResolver: (() => void) | null = null;

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
  }

  function fireEndResolver(): void {
    const cb = endResolver;
    endResolver = null;
    cb?.();
  }

  function fireCue(cue: SceneCue, nowMs: number): void {
    const { effect } = cue;
    if (effect.kind === 'fade') {
      // The fade verb is the player's own (`applySceneEffect` throws on it).
      for (const layer of effect.layers) {
        // `effect.over` is SECONDS; `fadeTo` takes ms.
        clipOpacity.fadeTo(layer, effect.to, effect.over * 1000, nowMs);
      }
      requestRender();
    } else {
      applySceneEffect(effect, { state: getEngineState(), store });
    }
  }

  function tick(
    clipEpoch: CameraEpochs['clip'],
    nowMs: number,
  ): { readonly clipEpoch: CameraEpochs['clip'] } {
    if (pendingEnd) {
      store.dispatch(clipEnded());
      resetState();
      fireEndResolver();
      // Advanced against the POST-dispatch clip: the resolver may start the
      // next clip synchronously, and the driver reads this epoch this frame.
      return { clipEpoch: advanceEpoch(clipEpoch, store.getState().camera.clip, nowMs) };
    }

    const clip = store.getState().camera.clip;
    const advanced = advanceEpoch(clipEpoch, clip, nowMs);
    if (clip === null) return { clipEpoch: advanced };

    const compiled = getCompiled(clip.data);
    // SECONDS: the timeline's `atSec` / `durationSec` unit.
    const elapsed = elapsedMs(advanced, nowMs) / 1000;

    clipOpacity.tick(nowMs);

    // `compiled.cues` is sorted ascending by atSec.
    for (const cue of compiled.cues) {
      if (cue.atSec > prevElapsed && cue.atSec <= elapsed) {
        fireCue(cue, nowMs);
      }
    }
    prevElapsed = elapsed;

    if (elapsed >= compiled.durationSec) {
      if (clip.data.loop) {
        // Rebased, not snapped: the overshoot carries into the next lap so a
        // slow frame costs no drift per cycle. The cursor rewinds with it so a
        // top-of-timeline cue re-fires. A looping clip ends only via `stop()`.
        const overshoot = elapsed - compiled.durationSec;
        prevElapsed = -Infinity;
        return { clipEpoch: { ...advanced, startMs: nowMs - overshoot * 1000 } };
      }
      pendingEnd = true;
    }
    return { clipEpoch: advanced };
  }

  function stop(): void {
    store.dispatch(clipEnded());
    resetState();
    // Cancellation RESOLVES the `playClip` Promise (the [CANCEL] hook calls this).
    fireEndResolver();
  }

  function clipOpacityOf(layer: VisibilityLayerKey, nowMs: number): number {
    return clipOpacity.factorOf(layer, nowMs);
  }

  function destroy(): void {
    clipOpacity.reset();
    compileCache = null;
    pendingEnd = false;
    prevElapsed = -Infinity;
    // Settles an in-flight `playClip` so the awaiter unwinds; the store is
    // deliberately left untouched.
    fireEndResolver();
  }

  function registerEndResolver(onEnd: () => void): void {
    // Overwrites: one playClip is in flight per clip, the prior resolver's
    // call site can no longer reach it.
    endResolver = onEnd;
  }

  return { tick, stop, clipOpacityOf, destroy, registerEndResolver };
}
