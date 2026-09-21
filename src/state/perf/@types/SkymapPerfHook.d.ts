/**
 * SkymapPerfHook — the shape of `window.__skymapPerf`, the ONLY seam the
 * Playwright perf harness talks through.
 *
 * Like the recorder hook, the perf harness drives the app from outside the page
 * (`page.evaluate`), so every method that must wait on the engine is
 * promise-shaped: awaiting `ready` blocks until the app is measure-ready,
 * `setPose` resolves once the camera has actually settled at the requested
 * vantage, and `collectTimings` resolves with the accumulated samples after the
 * requested frame count. `setStrategy` is the lone synchronous method — it just
 * flips which encode path the executor takes on the *next* frame, with nothing
 * to await. Confining the whole harness/app coupling surface to this handful of
 * members keeps `page.evaluate` from reaching into the store or the engine's
 * internals, exactly as the recorder seam does.
 */

import type { PerfPose } from '../../../@types/perf/PerfPose';
import type { PerfSample } from '../../../@types/perf/PerfSample';
import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';
import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';
import type { Tier } from '../../../@types/data/Tier';
import type { AppDispatch } from '../../../store/types';
import type { RootState } from '../../../store/types';

export type SkymapPerfHook = {
  readonly ready: Promise<void>;
  readonly setPose: (pose: PerfPose) => Promise<void>;
  readonly setStrategy: (s: RenderStrategy) => void;
  readonly collectTimings: (frames: number) => Promise<PerfSample[]>;
  /**
   * Hot-swap the catalog tier and resolve only once the new tier's bins are
   * loaded and committed. Promise-shaped like `setPose`: it dispatches the
   * `requestTier` COMMAND (never `setTier` directly — the saga owns the write)
   * and awaits a FRESH `whenStablyReady`, the same debounced boot predicate, so
   * the harness measures a settled scene rather than one mid-reload. A same-tier
   * request no-ops in the saga and the wait just resolves after the debounce.
   */
  readonly setTier: (tier: Tier) => Promise<void>;
  /**
   * The tier the store is CURRENTLY on. The harness reads it back after any
   * `--tier` switch so a report carries the ACTUAL measured tier, never an
   * assumed boot default.
   */
  readonly getTier: () => Tier;
  /**
   * Slot/layer name → its render-step groupKey (`'orbit-trails' → 'hdr·NEAR0'`;
   * a group-key row maps to itself). The Node harness can't import
   * `timedSlots`/`CONTENT_PASSES` — their transitive `.wesl?static` shader
   * imports only resolve under Vite — so this snapshot carries the map across
   * the seam: the harness buckets its per-layer measurements into groups (for
   * the floor estimate) without ever loading a renderer module.
   */
  /**
   * The store's own `dispatch` and `getState`, so a harness (or a console at a
   * phone on the far end of a CDP tunnel) can drive any app COMMAND action —
   * `flyToLonLat`, a settings toggle — without a DOM path through the debug
   * panel. Deliberately the raw pair rather than a curated per-action method:
   * the actions are the app's own public vocabulary, and mirroring each one
   * here would be a second surface to keep in sync.
   */
  readonly dispatch: AppDispatch;
  readonly getState: () => RootState;
  readonly slotGroups: Readonly<Record<TimingSlotName, string>>;
};
