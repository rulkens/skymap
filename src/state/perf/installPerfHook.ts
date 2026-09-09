/**
 * installPerfHook — expose `window.__skymapPerf` (the perf harness's single
 * seam) when the page runs in perf mode.
 *
 * Takes the engine HANDLE, never a copied reference: `engine.debug.timingService`
 * is a live getter that `initGpu`'s async IIFE swaps from a no-op stub to the
 * device-aware service AFTER `createEngine` returns, so a copy would point at the
 * stub forever. That is also why it installs from `useEngine`'s effect rather
 * than `main.tsx`. Outside perf mode the whole thing is a no-op.
 */

import { isPerfMode } from '../../utils/url/isPerfMode';
import { whenStablyReady } from '../lifecycle/whenStablyReady';
import { cancelCameraTween, commitCameraPose, setAutoRotate } from '../camera/cameraSlice';
import { absoluteArm } from '../../utils/camera/absoluteArm';
import { clearSelection } from '../selection/selectionSlice';
import { setRenderStrategy } from '../settings/settingsSlice';
import { requestTier } from '../tier/requestTier';
import { selectTier } from '../tier/selectors';
import { TIMED_SLOT_GROUPS } from '../../services/engine/frame/frameProgram';
import type { AppStore } from '../../store/types';
import type { EngineHandle } from '../../@types/engine/EngineHandle';
import type { SkymapPerfHook } from '../../@types/perf/SkymapPerfHook';
import type { PerfWindow } from '../../@types/perf/PerfWindow';
import type { PerfPose } from '../../@types/perf/PerfPose';
import type { PerfSample } from '../../@types/perf/PerfSample';
import type { RenderStrategy } from '../../@types/engine/frame/RenderStrategy';
import type { Tier } from '../../@types/data/Tier';

// Per-frame yaw advance in radians; mirrors the camera slice's inline
// `initialState.autoRotate.rate`, which the slice does not export.
const PERF_AUTO_ROTATE_RATE = 0.000873;

// Delivered timing frames to discard before measuring. GPU timestamp readback lags
// the render by 1–2 frames (double-buffered staging), so right after a
// strategy/pose flip the first delivered frames still describe the PRIOR state —
// a stale group-key slot leaking into per-layer samples corrupts the floor estimate.
export const PERF_WARMUP_FRAMES = 3;

// Slot/layer name → render-step groupKey, handed across the `window.__skymapPerf`
// seam so the Node harness can bucket per-layer timings WITHOUT importing
// `frameProgram` — its transitive `.wesl?static` imports only resolve under Vite,
// so a `tsx` process would throw. Group-key rows map to themselves, so a merged-run
// group slot resolves through the same table as its per-layer children.
const SLOT_GROUPS: Readonly<Record<string, string>> = Object.fromEntries(
  TIMED_SLOT_GROUPS.flatMap((group) => group.rows.map((row) => [row.name, row.groupKey])),
);

// Hard-cut the camera to `pose`: a benchmark wants an exact vantage, and the
// re-armed auto-rotate keeps the render-on-demand loop awake for the whole window.
async function setPose(store: AppStore, pose: PerfPose): Promise<void> {
  if (pose.clearFocus === true) {
    store.dispatch(clearSelection());
    // Let one frame elapse first: the deactivating follow driver's commit-on-edge
    // bake writes its stale last pose into `camera.base` on the next produce, and
    // must land BEFORE the commit below or it overwrites this pose's target.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  store.dispatch(cancelCameraTween());
  store.dispatch(
    commitCameraPose(
      absoluteArm({
        target: pose.target,
        yaw: pose.yaw,
        pitch: pose.pitch,
        distance: pose.distance,
      }),
    ),
  );
  store.dispatch(setAutoRotate({ active: true, rate: pose.rate ?? PERF_AUTO_ROTATE_RATE }));
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function collectTimings(engine: EngineHandle, frames: number): Promise<PerfSample[]> {
  // Reject rather than subscribe when timing is a no-op stub: its `subscribe`
  // never emits, so subscribing would hang the harness inside `page.evaluate`
  // forever with no diagnostic.
  if (!engine.debug.timingService.enabled) {
    return Promise.reject(
      new Error(
        'perf: GPU timing service is disabled (no timestamp-query?) — cannot collect timings',
      ),
    );
  }
  return new Promise<PerfSample[]>((resolve) => {
    const samples: PerfSample[] = [];
    let delivered = 0;
    let measured = 0;
    const unsubscribe = engine.debug.timingService.subscribe((frame) => {
      delivered += 1;
      if (delivered <= PERF_WARMUP_FRAMES) return;
      // `frame` is the 0-based MEASURED-frame ordinal (post-warmup), the tag
      // `frameTotals` reconstructs per-frame GPU cost from downstream.
      for (const [slot, ms] of frame.perPassMs) {
        samples.push({ slot, ms, frame: measured });
      }
      measured += 1;
      if (measured >= frames) {
        unsubscribe();
        resolve(samples);
      }
    });
  });
}

// A FRESH `whenStablyReady` rather than a per-source wait: the same engine-ready
// + loads-settled debounce that gates boot also detects a tier reload completing.
function setTier(store: AppStore, tier: Tier): Promise<void> {
  store.dispatch(requestTier(tier));
  return whenStablyReady(store);
}

export function installPerfHook(store: AppStore, engine: EngineHandle): void {
  if (!isPerfMode()) return;
  const hook: SkymapPerfHook = {
    ready: whenStablyReady(store),
    setPose: (pose: PerfPose) => setPose(store, pose),
    setStrategy: (s: RenderStrategy) => store.dispatch(setRenderStrategy(s)),
    collectTimings: (frames: number) => collectTimings(engine, frames),
    setTier: (tier: Tier) => setTier(store, tier),
    getTier: () => selectTier(store.getState()),
    slotGroups: SLOT_GROUPS,
  };
  (window as PerfWindow).__skymapPerf = hook;
}
