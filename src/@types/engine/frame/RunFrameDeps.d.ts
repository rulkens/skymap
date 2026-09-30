/**
 * RunFrameDeps — closure captures the per-frame body relies on.
 *
 * Every entry was a free reference in the original
 * `engine.ts:1407–1708` body; the galaxy catalog done in Phase 3 Task 3.1
 * enumerated each one by source (createEngine arg, IIFE-local renderer,
 * createEngine helper, etc.) and confirmed read-only vs. mutated.
 *
 * ### Why no renderer fields
 *
 * Pre-unification this bag also carried `milkyWayCloudRenderer`,
 * `horizonShellRenderer`, `filamentRenderer`, `texturedDiskRenderer`, and
 * `proceduralDiskRenderer` — but `runFrame` only ever forwarded them,
 * unread, into `RenderFrameInput`.  Now that every `ContentPass` reads its
 * renderer straight off `state.gpu.*` (see `passes/index.ts`), those fields
 * were dead weight here; they're gone along with the matching
 * `RenderFrameInput` fields.
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
   * Control-scheme registry (`CONTROL_SCHEMES`, overridable by a fixture); each
   * scheme's driver table feeds `pickWinner`, which picks the single
   * highest-priority active winner each frame and is also the source of truth
   * for "is the camera animating" (render-on-demand gate).
   */
  readonly controlSchemes: Readonly<Record<ControlSchemeId, ControlScheme>>;
};
