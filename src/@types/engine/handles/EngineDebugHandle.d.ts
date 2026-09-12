/**
 * EngineDebugHandle — the engine's observability sub-handle: debug/inspection
 * surfaces the React shell reads.
 *
 * Every member is a getter, never a copied reference. The things behind them
 * (`timingService`, the asset slots, `earthTiles`, `cameraRuntime`) are
 * reassigned or minted by the async bootstrap that runs AFTER `createEngine`
 * returns, so a reference captured at handle construction would point at an
 * eager stub — or at nothing — forever.
 */

import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { FrameStats } from '../FrameStats';
import type { EarthTileDebugSnapshot } from '../../scene/EarthTileDebugSnapshot';
import type { CameraDebugSnapshot } from '../../camera/CameraDebugSnapshot';

/**
 * Read-only pass-name list for the DebugPanel's renderer-toggle section.
 * Toggle writes go to the store via `setPassDisabled`; the one-way override
 * semantics (can hide a passing pass, cannot force-enable a gated one) are
 * enforced in the encoder loop.
 */
export type PassOverridesHandle = {
  /** Every pass name across the HDR + UI registries, in draw order. */
  readonly allNames: readonly string[];
};

export type EngineDebugHandle = {
  /**
   * Always non-null: check `.enabled` before subscribing — disabled means
   * either no `?gpuTimings` or an adapter without `timestamp-query`.
   */
  readonly timingService: GpuTimingService;
  /** Rolling CPU-side frame stats (fps + JS-body ms + idle) — no GPU query. */
  readonly frameStats: () => FrameStats;
  readonly passOverrides: PassOverridesHandle;
  /** Authored fetch rank per slot name (lower fetches first), from `ASSET_WIRING`. */
  readonly assetPriorities: () => ReadonlyMap<string, number>;
  /**
   * Earth surface tile atlas residency. Returns a quiet empty snapshot
   * (`engaged: false`) rather than `null` after destroy, so the panel never
   * needs its own absent-subsystem branch.
   */
  readonly earthTiles: () => EarthTileDebugSnapshot;
  /**
   * Camera-pivot readout for the DebugPanel's "Camera" section. A fresh
   * derivation off live Resources at call time, never a per-frame write, so an
   * unopened panel costs nothing.
   */
  readonly cameraDebug: () => CameraDebugSnapshot;
};
