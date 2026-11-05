/**
 * RunFrameDeps — the closure captures the per-frame body relies on. It carries no
 * renderers: every `ContentPass` reads its own (core's off `state.gpu`, a Layer's
 * off its runtime).
 */

import type { EngineCallbacks } from '../EngineCallbacks';
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
import type { ControlScheme } from '../camera/ControlScheme';
import type { ControlSchemeId } from '../camera/ControlSchemeId';

export type RunFrameDeps = {
  /** createEngine arg — for resize + viewport reads. */
  canvas: HTMLCanvasElement;
  /** createEngine arg — carries the Redux store the frame loop dispatches through (camera pose, `engineScaleChanged`). */
  cb: EngineCallbacks;
  /** GPU device handle from `initGpu`. */
  device: GPUDevice;
  /** Swap-chain context handle from `initGpu`. */
  context: GPUCanvasContext;
  /**
   * Per-pass GPU timing service.  Always non-null — check `.enabled`
   * before doing timing work.  Forwarded straight through to
   * `renderFrame` via `RenderFrameInput.timingService`.
   */
  timingService: GpuTimingService;
  /**
   * Control-scheme registry (`composeControlSchemes`, overridable by a fixture); each
   * scheme's driver table feeds `pickWinner`, which picks the single
   * highest-priority active winner each frame and is also the source of truth
   * for "is the camera animating" (render-on-demand gate).
   */
  readonly controlSchemes: Readonly<Record<ControlSchemeId, ControlScheme>>;
};
