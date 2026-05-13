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
 * `state.gpu.timingService` is assigned by the async `initGpu`
 * IIFE that runs AFTER `createEngine` returns.  A copied reference
 * captured at handle construction would always be `null`.  The
 * getter reads the live slot every time the React shell asks for it.
 */

import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';

export type EngineDebugHandle = {
  /**
   * The optional GPU timing service.  `null` when the engine was
   * constructed without the `?gpuTimings` URL gate OR the adapter
   * lacks the `timestamp-query` feature.  The `DebugPanel`'s
   * `GpuTimingsSection` reads this; when it's `null` the section
   * renders a fallback message instead of subscribing.
   */
  readonly timingService: GpuTimingService | null;
};
