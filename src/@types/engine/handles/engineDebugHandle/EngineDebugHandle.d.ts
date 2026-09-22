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
   * Flat read-only registry of every asset slot the engine owns, keyed by the
   * slot's `name` (e.g. `'sdss-points'`, `'2mrs-points'`, `'glade-points'`,
   * `'famous-points'`, `'filaments'`, `'famous-galaxies-meta'`, `'pgc-aliases'`).
   * Type-erased to `AssetSlot<unknown, unknown>` because the slots carry
   * different payload + request shapes — the dev panel only needs the
   * discriminated `state()` projection, uniform across slot types. Populated
   * lazily as the async bootstrap wires each slot, so the Map may be empty for
   * the first frames. Read-only contract: drive slots via `slot.load()` /
   * `slot.forceReload()` / `slot.cancel()`, never by mutating the Map.
   */
  readonly assetSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  /**
   * Always non-null: check `.enabled` before subscribing — disabled means
   * either no `?gpuTimings` or an adapter without `timestamp-query`.
   */
  readonly timingService: GpuTimingService;
  /**
   * Mark the scene dirty on the render-on-demand scheduler (coalesced). The
   * perf harness pumps its own sampling window through this: no camera arm
   * animates by itself, so without it a measurement of a static vantage stalls
   * after the loop goes back to sleep.
   */
  readonly requestRender: () => void;
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
  readonly surfaceTiles: () => SurfaceTileDebugSnapshot;
  /**
   * Camera-pivot readout for the DebugPanel's "Camera" section. A fresh
   * derivation off live Resources at call time, never a per-frame write, so an
   * unopened panel costs nothing.
   */
  readonly cameraDebug: () => CameraDebugSnapshot;
  /**
   * The GPU-memory ledger's live tally (see `trackGpuMemory.ts`). A fresh
   * read off `state.gpu.uiCtx.memory` at call time, like `surfaceTiles` — the
   * GPU context arrives async, so this returns an empty snapshot pre-boot.
   */
  readonly gpuMemory: () => GpuMemorySnapshot;
};
