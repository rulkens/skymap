/**
 * EngineDebugHandle — the engine's observability sub-handle.
 *
 * Hosts debug/inspection surfaces the React shell reads.  Today's
 * inhabitants are `timingService` (GPU timing), `frameStats` (the
 * always-on CPU-side fps + JS-frame-time readout), and `passOverrides`
 * (read-only pass-name list); further additions (render-stat counters,
 * frame-timeline exports) cluster here rather than sprawling across the
 * top-level handle.
 *
 * ### Why a sub-handle for one field
 *
 * The engine handle is cluster-shaped — every related method lives
 * under a topical namespace.  Adding `timingService` at the root
 * would regress toward a flat surface.  A `debug` namespace
 * telegraphs intent ("this is dev/debug scaffolding, not a knob")
 * and gives future debug additions a natural place to land without
 * re-litigating placement each time.
 *
 * ### Why a getter rather than a copied reference
 *
 * `state.gpu.timingService` is reassigned by the async `initGpu`
 * IIFE that runs AFTER `createEngine` returns (an eager no-op stub
 * is replaced with the device-aware service).  A copied reference
 * captured at handle construction would point at the stub forever.
 * The getter reads the live slot every time the React shell asks
 * for it.
 */

import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { FrameStats } from '../FrameStats';
import type { EarthTileDebugSnapshot } from '../../scene/EarthTileDebugSnapshot';

/**
 * `passOverrides` — read-only pass-name list for the DebugPanel's
 * renderer-toggle section.
 *
 * `allNames` is materialised from the encoder's HDR + UI pass
 * registries in draw order so the React panel can render one
 * checkbox per pass without enumerating kebab-case names itself.
 * The one-way override semantics (can hide a passing pass, cannot
 * force-enable a gated one) are enforced in the encoder loop;
 * `selectDisabledPasses` reads the live record back from the store.
 *
 * Toggle writes are dispatched directly via `setPassDisabled`
 * (RTK action) — no write surface lives on this handle.
 */
export type PassOverridesHandle = {
  /** Every pass name across HDR + UI registries, in draw order. */
  readonly allNames: readonly string[];
};

export type EngineDebugHandle = {
  /**
   * The GPU timing service (always non-null).  Check `.enabled`
   * before subscribing — disabled means either the user didn't
   * set `?gpuTimings` or the adapter lacks `timestamp-query`.
   * The `DebugPanel`'s `GpuTimingsSection` shows a fallback message
   * in either case.
   */
  readonly timingService: GpuTimingService;
  /** Rolling CPU-side frame stats (fps + JS-body ms + idle), always available — no GPU query. */
  readonly frameStats: () => FrameStats;
  /**
   * Read-only pass-name list for the DebugPanel's renderer-toggle
   * section.  `allNames` is the source of truth for which passes
   * exist; checkbox writes go to the store via `setPassDisabled`.
   */
  readonly passOverrides: PassOverridesHandle;
  /**
   * Authored fetch rank per slot name (lower fetches first), derived from
   * `ASSET_WIRING` — the panel's ordering key and rank column.
   *
   * A function, not a snapshot Map, for the same reason `timingService` is a
   * getter: slots are minted by the async bootstrap IIFE well after this handle
   * is built, so a Map captured at construction would be permanently empty.
   */
  readonly assetPriorities: () => ReadonlyMap<string, number>;
  /**
   * Earth surface tile atlas residency for the DebugPanel's "Earth tile atlas"
   * section — a getter, not a snapshot, for the same reason as `frameStats`:
   * `state.subsystems.earthTiles` is minted well after this handle is built,
   * and stands down to `null` on destroy. Returns a quiet empty snapshot
   * (`engaged: false`) rather than `null` so the panel never needs its own
   * absent-subsystem branch.
   */
  readonly earthTiles: () => EarthTileDebugSnapshot;
};
