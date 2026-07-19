/**
 * installPerfHook — expose `window.__skymapPerf` (the perf harness's single
 * seam) when the page runs in perf mode.
 *
 * The `?perf` gate lives INSIDE the installer, not at the call site: the caller
 * invokes it unconditionally (one line, no branch to forget) and the gate
 * itself stays unit-testable by mocking `isPerfMode`. Outside perf mode this is
 * a pure no-op — nothing is attached to `window`, no subscription is created.
 *
 * ### Why it takes the engine handle, and installs from `useEngine`
 *
 * Everything the perf hook needs lives in the redux store EXCEPT the GPU timing
 * service, which is reachable only via `engine.debug.timingService` — a LIVE
 * GETTER on the engine handle (the async `initGpu` IIFE swaps a no-op stub for
 * the device-aware service AFTER `createEngine` returns, so a copied reference
 * would point at the stub forever). So the installer takes the handle and is
 * called from `useEngine`'s effect right after `handleRef.current = handle`,
 * NOT from `main.tsx` like the recorder hook. `collectTimings` reads
 * `engine.debug.timingService` at CALL time — always after `ready` has
 * resolved, by which point the real service is wired.
 *
 * ### `ready` — the shared debounced predicate
 *
 * `ready` is `whenStablyReady(store)` from `../lifecycle/whenStablyReady`, the
 * same debounce the recorder awaits; its module header explains why a
 * first-true resolve would fire mid-bootstrap and why the predicate must hold
 * for a stability window instead.
 *
 * ### `setPose` — hard-cut the camera, then wait one frame
 *
 * A benchmark wants a reproducible vantage with no choreography: cancel any
 * in-flight tween, commit the pose wholesale, and (re)arm auto-rotate — active,
 * so the render-on-demand loop stays awake for the whole sampling window
 * without a manual pump. `pose.rate` overrides the default orbit speed;
 * omitted, it falls back to `PERF_AUTO_ROTATE_RATE` (mirrors the camera slice's
 * inline default, which the slice does NOT export). Resolving on the next
 * `requestAnimationFrame` is the cheapest honest "the pose has been committed to
 * a frame" signal.
 *
 * ### `collectTimings` — subscribe, accumulate, unsubscribe
 *
 * Subscribe to the live timing service; for each emitted `GpuTimingFrame`, flatten
 * its `perPassMs` map into `{ slot, ms }` samples; after `frames` frames have
 * arrived, unsubscribe and resolve with the flat `PerfSample[]`. Auto-rotate
 * (armed by the preceding `setPose`) is an active driver holding the loop awake
 * for the whole window, so no manual render pump is needed.
 *
 * The `window` write goes through the `PerfWindow` cast instead of a
 * `declare global` `interface Window` augmentation — the house style bans
 * `interface`, and the only reader is the harness's untyped `page.evaluate`.
 */

import { isPerfMode } from '../../utils/url/isPerfMode';
import { whenStablyReady } from '../lifecycle/whenStablyReady';
import { cancelCameraTween, commitCameraPose, setAutoRotate } from '../camera/cameraSlice';
import { setRenderStrategy } from '../settings/settingsSlice';
import type { AppStore } from '../../store/types';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { SkymapPerfHook } from '../../@types/perf/SkymapPerfHook';
import type { PerfWindow } from '../../@types/perf/PerfWindow';
import type { PerfPose } from '../../@types/perf/PerfPose';
import type { PerfSample } from '../../@types/perf/PerfSample';
import type { RenderStrategy } from '../../@types/engine/frame/RenderStrategy';

// Default per-frame yaw advance for a "slow orbit while sampling" pose. Mirrors
// the camera slice's inline `initialState.autoRotate.rate` — the slice does not
// export it, and importing the engine here would couple state→engine the wrong
// way (the slice's own comment). A scenario's `pose.rate` overrides this.
const PERF_AUTO_ROTATE_RATE = 0.000873;

// Hard-cut the camera to `pose` and resolve once the next frame has been
// scheduled. No tween: a benchmark wants an exact vantage, not choreography.
function setPose(store: AppStore, pose: PerfPose): Promise<void> {
  store.dispatch(cancelCameraTween());
  store.dispatch(
    commitCameraPose({
      target: pose.target,
      yaw: pose.yaw,
      pitch: pose.pitch,
      distance: pose.distance,
    }),
  );
  store.dispatch(setAutoRotate({ active: true, rate: pose.rate ?? PERF_AUTO_ROTATE_RATE }));
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

// Subscribe to the live GPU timing service, flatten each frame's per-pass map
// into samples, and resolve once `frames` frames have arrived.
function collectTimings(engine: EngineHandle, frames: number): Promise<PerfSample[]> {
  return new Promise<PerfSample[]>((resolve) => {
    const samples: PerfSample[] = [];
    let seen = 0;
    const unsubscribe = engine.debug.timingService.subscribe((frame) => {
      for (const [slot, ms] of frame.perPassMs) {
        samples.push({ slot, ms });
      }
      seen += 1;
      if (seen >= frames) {
        unsubscribe();
        resolve(samples);
      }
    });
  });
}

export function installPerfHook(store: AppStore, engine: EngineHandle): void {
  if (!isPerfMode()) return;
  const hook: SkymapPerfHook = {
    ready: whenStablyReady(store),
    setPose: (pose: PerfPose) => setPose(store, pose),
    setStrategy: (s: RenderStrategy) => store.dispatch(setRenderStrategy(s)),
    collectTimings: (frames: number) => collectTimings(engine, frames),
  };
  (window as PerfWindow).__skymapPerf = hook;
}
