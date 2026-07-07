/**
 * RunFrameDeps — closure captures the per-frame body relies on.
 *
 * Every entry was a free reference in the original
 * `engine.ts:1407–1708` body; the galaxy catalog done in Phase 3 Task 3.1
 * enumerated each one by source (createEngine arg, IIFE-local renderer,
 * createEngine helper, etc.) and confirmed read-only vs. mutated.
 */

import type { EngineCallbacks } from '../EngineCallbacks';
import type { TexturedDiskRenderer } from '../../rendering/TexturedDiskRenderer';
import type { ProceduralDiskRenderer } from '../../rendering/ProceduralDiskRenderer';
import type { MilkyWayCloudRenderer } from '../../rendering/MilkyWayCloudRenderer';
import type { HorizonShellRenderer } from '../../rendering/HorizonShellRenderer';
import type { FilamentRenderer } from '../../rendering/FilamentRenderer';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { CameraDriver } from '../camera/CameraDriver';

export type RunFrameDeps = {
  /** createEngine arg — for resize + viewport reads. */
  canvas: HTMLCanvasElement;
  /** createEngine arg — carries the Redux store the frame loop dispatches through (camera pose, `engineScaleChanged`). */
  cb: EngineCallbacks;
  /** GPU device handle from `initGpu`. */
  device: GPUDevice;
  /** Swap-chain context handle from `initGpu`. */
  context: GPUCanvasContext;
  /** Milky-Way point-cloud renderer; read off `state.gpu.milkyWayCloudRenderer` by `initGpu`. */
  milkyWayCloudRenderer: MilkyWayCloudRenderer;
  /** Observable-universe horizon shell renderer; instantiated inside the IIFE. */
  horizonShellRenderer: HorizonShellRenderer;
  /** Filament renderer; instantiated inside the IIFE. */
  filamentRenderer: FilamentRenderer;
  /** Atlas-bound 3D-oriented disk renderer for large galaxy thumbnails. */
  texturedDiskRenderer: TexturedDiskRenderer;
  /** Procedural-disk renderer (LOD-1; synthetic ellipse fill). */
  proceduralDiskRenderer: ProceduralDiskRenderer;
  /**
   * Per-pass GPU timing service.  Always non-null — check `.enabled`
   * before doing timing work.  Forwarded straight through to
   * `renderFrame` via `RenderFrameInput.timingService`.
   */
  timingService: GpuTimingService;
  /**
   * Camera-control drivers, built once at loop start. The resolver
   * (`runCameraDrivers`) picks the single highest-priority active winner
   * each frame and is also the source of truth for "is the camera
   * animating" (render-on-demand gate). Order in this array is not
   * significant — `priority` decides.
   */
  readonly drivers: readonly CameraDriver[];
};
