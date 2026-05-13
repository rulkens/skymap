/**
 * EngineDebugHandle — the engine's observability sub-handle.
 *
 * Hosts handles to debug/inspection surfaces the React shell reads
 * but never drives.  Today the only inhabitant is `timingService`;
 * future debug surfaces (CPU-timing breakdowns, render-stat
 * counters, frame-timeline exports) cluster here rather than
 * sprawling across the top-level handle.
 *
 * ### Why a sub-handle for one field
 *
 * H5 (2026-05-11) moved the engine handle from a flat ~50-method
 * surface to a cluster-shaped one — every related method lives
 * under a topical namespace.  Adding `timingService` at the root
 * would regress to the flat shape for new fields.  A `debug`
 * namespace is the cluster-shaped home that telegraphs intent
 * ("this is dev/debug scaffolding, not a knob") and gives future
 * debug additions a natural place to land without re-litigating
 * placement each time.
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

export type EngineDebugHandle = {
  /**
   * The GPU timing service (always non-null).  Check `.enabled`
   * before subscribing — disabled means either the user didn't
   * set `?gpuTimings` or the adapter lacks `timestamp-query`.
   * The `DebugPanel`'s `GpuTimingsSection` shows a fallback message
   * in either case.
   */
  readonly timingService: GpuTimingService;
};
