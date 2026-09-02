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
 * ### `collectTimings` — reject-if-disabled, warm up, subscribe, accumulate, unsubscribe
 *
 * First guard: if the live timing service is a no-op STUB (`enabled === false`
 * — the adapter lacks `timestamp-query`, or neither `?gpuTimings` nor `?perf`
 * is set, see `initGpu`), reject IMMEDIATELY. The stub's `subscribe` never
 * emits, so without this guard the Promise would never settle and the harness
 * would hang forever inside `page.evaluate` with zero diagnostic. Converting the
 * hang into an eager error is the honest failure mode: a benchmark on hardware
 * that can't be timed should say so, not spin.
 *
 * Otherwise: subscribe to the live timing service; for each emitted
 * `GpuTimingFrame`, flatten its `perPassMs` map into `{ slot, ms, frame }`
 * samples — `frame` is the 0-based MEASURED-frame ordinal (assigned AFTER the
 * warmup discard), so every slot on the Nth measured frame carries `frame: N`.
 * That tag is what lets `frameTotals` reconstruct per-frame GPU cost downstream.
 * After `frames` MEASURED frames have arrived, unsubscribe and resolve with the
 * flat `PerfSample[]`. Auto-rotate
 * (armed by the preceding `setPose`) is an active driver holding the loop awake
 * for the whole window, so no manual render pump is needed.
 *
 * The first `PERF_WARMUP_FRAMES` delivered frames are DISCARDED, not measured:
 * GPU timestamp readback lands 1–2 frames behind the render (the staging buffer
 * is double-buffered — see `GpuTimingFrame`), so right after a `setStrategy` /
 * `setPose` flip the first delivered frames still describe the PRIOR state. A
 * merged-strategy frame bills one slot per render-step GROUP (`hdr·NEAR0`, …);
 * a perLayerTimed frame bills one slot per LAYER (`orbit-trails`, …). Without
 * the warmup a stale group-key slot leaks into a per-layer sample (and vice
 * versa), corrupting the floor estimate. Skipping a small fixed count is the
 * cheapest honest fence — no attempt to correlate frame indices across the flip.
 *
 * The `window` write goes through the `PerfWindow` cast instead of a
 * `declare global` `interface Window` augmentation — the house style bans
 * `interface`, and the only reader is the harness's untyped `page.evaluate`.
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

// Default per-frame yaw advance for a "slow orbit while sampling" pose. Mirrors
// the camera slice's inline `initialState.autoRotate.rate` — the slice does not
// export it, and importing the engine here would couple state→engine the wrong
// way (the slice's own comment). A scenario's `pose.rate` overrides this.
const PERF_AUTO_ROTATE_RATE = 0.000873;

// Delivered timing frames to discard before measuring. GPU timestamp readback
// lags the render by 1–2 frames (double-buffered staging), so right after a
// strategy/pose flip the first few delivered frames still describe the PRIOR
// state — a stale group-key vs. per-layer-key slot leaking into the wrong
// strategy's samples. Three covers the worst-case readback lag with margin;
// exported so `installPerfHook.test.ts` can drive the exact warmup count.
export const PERF_WARMUP_FRAMES = 3;

// Slot/layer name → render-step groupKey, flattened once from the same walk the
// DebugPanel groups on. Handed across the `window.__skymapPerf` seam so the Node
// harness can bucket its per-layer timings into groups (for the floor estimate)
// WITHOUT importing `frameProgram` — its transitive `.wesl?static` shader
// imports only resolve under Vite, so a `tsx` process would throw on them. Safe
// to reference here: this is a Vite-built src module. Group-key rows map to
// themselves (`'hdr·NEAR0' → 'hdr·NEAR0'`), so a merged-run group slot resolves
// through the same table as its per-layer children.
const SLOT_GROUPS: Readonly<Record<string, string>> = Object.fromEntries(
  TIMED_SLOT_GROUPS.flatMap((group) => group.rows.map((row) => [row.name, row.groupKey])),
);

// Hard-cut the camera to `pose` and resolve once the next frame has been
// scheduled. No tween: a benchmark wants an exact vantage, not choreography.
async function setPose(store: AppStore, pose: PerfPose): Promise<void> {
  if (pose.clearFocus === true) {
    store.dispatch(clearSelection());
    // Let one frame elapse before committing the pose: the deactivating
    // follow driver's commit-on-edge bake writes its (stale) last pose into
    // `camera.base` on the next produce, and must land BEFORE the commit
    // below or it would overwrite the target this pose exists to set.
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

// Subscribe to the live GPU timing service, discard the first
// `PERF_WARMUP_FRAMES` delivered frames (readback lag — see the module header),
// then flatten each measured frame's per-pass map into samples and resolve once
// `frames` MEASURED frames have arrived.
function collectTimings(engine: EngineHandle, frames: number): Promise<PerfSample[]> {
  // Reject rather than subscribe when timing is a no-op stub: its `subscribe`
  // never emits, so subscribing here would hang the harness forever with no
  // diagnostic (see the module header). Fail loud and early instead.
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
      // `measured` is the 0-based ordinal of THIS (post-warmup) frame — tag it
      // onto every slot so `frameTotals` can group by frame. Incremented after.
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

// Ask for a tier change (the COMMAND — the saga owns the `setTier` write and
// the eviction/reload), then resolve once the new tier's bins are loaded and
// committed. Awaiting a FRESH `whenStablyReady` reuses the boot-ready predicate
// rather than inventing a per-source wait (record.ts precedent): the same
// engine-ready + loads-settled debounce that gates boot also detects a tier
// reload completing. A same-tier request no-ops in the saga; the fresh wait then
// just resolves after the stability window — correct behaviour, no special case.
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
    // The store's current tier — reports carry the ACTUAL tier, not a boot default.
    getTier: () => selectTier(store.getState()),
    slotGroups: SLOT_GROUPS,
  };
  (window as PerfWindow).__skymapPerf = hook;
}
