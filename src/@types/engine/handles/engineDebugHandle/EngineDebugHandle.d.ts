/**
 * EngineDebugHandle — the engine's observability sub-handle: debug/inspection
 * surfaces the React shell reads.
 *
 * Every member is a getter, never a copied reference. The things behind them
 * (`timingService`, the asset slots, `surfaceTiles`, `cameraRuntime`) are
 * reassigned or minted by the async bootstrap that runs AFTER `createEngine`
 * returns, so a reference captured at handle construction would point at an
 * eager stub — or at nothing — forever.
 */

import type { GpuTimingService } from '../../../gpu/timing/GpuTimingService';
import type { FrameStats } from '../../FrameStats';
import type { SurfaceTileDebugSnapshot } from '../../../scene/SurfaceTileDebugSnapshot';
import type { CameraDebugSnapshot } from '../../../camera/CameraDebugSnapshot';
import type { AssetSlot } from '../../../loading/AssetSlot';
import type { GpuMemorySnapshot } from '../../../gpu/memory/GpuMemorySnapshot';
import type { PassOverridesHandle } from './PassOverridesHandle';

export type EngineDebugHandle = {
  /**
   * Every asset slot, keyed by slot `name` (e.g. `'sdss-points'`). Type-erased
   * because payload shapes differ; the panel only reads `state()`. Filled as
   * the async bootstrap wires slots, so empty for the first frames. Drive
   * slots via `load()`/`forceReload()`/`cancel()`, never by mutating the Map.
   */
  readonly assetSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  /**
   * Always non-null: check `.enabled` before subscribing — disabled means
   * either no `?gpuTimings` or an adapter without `timestamp-query`.
   */
  readonly timingService: GpuTimingService;
  /** Marks the scene dirty on the render-on-demand scheduler; the perf harness needs it, else a static vantage stalls once the loop sleeps. */
  readonly requestRender: () => void;
  /** Rolling CPU-side frame stats (fps + JS-body ms + idle) — no GPU query. */
  readonly frameStats: () => FrameStats;
  readonly passOverrides: PassOverridesHandle;
  /** Authored fetch rank per slot name (lower fetches first), from the composed asset rows. */
  readonly assetPriorities: () => ReadonlyMap<string, number>;
  /** Earth tile atlas residency; an empty snapshot (`engaged: false`), never null, after destroy. */
  readonly surfaceTiles: () => SurfaceTileDebugSnapshot;
  /** Camera-pivot readout, derived at call time so an unopened panel costs nothing. */
  readonly cameraDebug: () => CameraDebugSnapshot;
  /** GPU-memory ledger tally (`trackGpuMemory.ts`); empty snapshot pre-boot since the ledger installs async. */
  readonly gpuMemory: () => GpuMemorySnapshot;
};
