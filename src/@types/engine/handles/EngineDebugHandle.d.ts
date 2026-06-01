/**
 * EngineDebugHandle — the engine's observability sub-handle.
 *
 * Hosts handles to debug/inspection surfaces the React shell reads
 * but never drives.  Today's inhabitants are `timingService` (read)
 * and `passOverrides` (read/write toggle bag); future debug surfaces
 * (CPU-timing breakdowns, render-stat counters, frame-timeline
 * exports) cluster here rather than sprawling across the top-level
 * handle.
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

/**
 * `passOverrides` — DebugPanel hook for toggling individual renderer
 * passes off (HDR + UI overlay).  Backed by `state.debug.disabledPasses`.
 *
 * The override is **one-way**: it can hide a pass that would otherwise
 * run, but can never force-enable a pass whose own `enabled()` gate
 * returned false.  Toggling triggers a one-frame re-render so the
 * change shows up while the render-on-demand loop is idle.
 *
 * `allNames` lists every pass name across HDR + UI registries in
 * deterministic draw order.  Callers iterate it to render a UI row per
 * pass without enumerating the kebab-case names themselves.
 */
export type PassOverridesHandle = {
  /** Every pass name across HDR + UI registries, in draw order. */
  readonly allNames: readonly string[];
  /** True if `name` is currently in the disabled set. */
  isDisabled(name: string): boolean;
  /**
   * Add (`disabled === true`) or remove (`disabled === false`) `name`
   * from the disabled set.  Wakes the render-on-demand loop so the
   * change shows up on the next frame even when the camera is idle.
   */
  setDisabled(name: string, disabled: boolean): void;
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
  /**
   * Per-pass on/off overrides for the DebugPanel's renderer-toggle
   * section.  See `PassOverridesHandle` for the one-way override
   * semantics.
   */
  readonly passOverrides: PassOverridesHandle;
  /**
   * Toggle the pick-buffer debug overlay (see
   * `EngineSettingsState.debug.showPickBuffer`).  Echoes through
   * `EngineCallbacks.debug.onShowPickBufferChange`.
   */
  setShowPickBuffer(enabled: boolean): void;
  /**
   * Toggle the disk-radius debug ring (see
   * `EngineSettingsState.debug.showDiskRadiusRing`).  Echoes through
   * `EngineCallbacks.debug.onShowDiskRadiusRingChange`.
   */
  setShowDiskRadiusRing(enabled: boolean): void;
};
