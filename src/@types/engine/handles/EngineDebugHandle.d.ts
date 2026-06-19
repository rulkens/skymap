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

/**
 * `passOverrides` — DebugPanel hook for toggling individual renderer
 * passes off (HDR + UI overlay).  The disabled record is engine-owned settings
 * state (`EngineSettingsState.debug.disabledPasses`); the React panel reads it
 * back via `selectDisabledPasses`, so this handle is write-only — there is no
 * `isDisabled` query.
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
  /**
   * Mark `name` disabled (`disabled === true`) or enabled
   * (`disabled === false`) in the disabled record.  Wakes the
   * render-on-demand loop so the change shows up on the next frame even
   * when the camera is idle.
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
};
