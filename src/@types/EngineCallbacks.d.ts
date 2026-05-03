/**
 * EngineCallbacks — the seam between the imperative WebGPU engine and the
 * React UI. The engine calls these functions only when values actually change,
 * so React's setState can be passed in directly without spurious re-renders.
 */

import type { EngineStatus } from './EngineStatus';
import type { PointInfo } from './PointInfo';
import type { ScaleInfo } from './ScaleInfo';
import type { LodMode } from './LodMode';
import type { Source } from '../data/sources';

/**
 * Callbacks the engine uses to push state changes into the UI layer.
 *
 * All callbacks are called synchronously from the engine's internal code,
 * except where noted. They are called only when the value actually changes,
 * so React's `setState` can be passed in directly.
 *
 * The three optional settings callbacks (`onPointSizeChange`, `onBrightnessChange`,
 * `onAutoRotateChange`) are optional so existing call-sites that don't need
 * settings panel integration continue to typecheck without changes.
 */
export type EngineCallbacks = {
  /** Fired whenever the engine status advances (initializing → loading → ready). */
  onStatusChange: (s: EngineStatus) => void;
  /** Fired when the point under the cursor changes (null = empty sky). */
  onHoverChange: (info: PointInfo | null) => void;
  /** Fired when the pinned/selected point changes. */
  onSelectChange: (info: PointInfo | null) => void;
  /** Fired when the scale bar label or width changes (zoom or resize). */
  onScaleChange: (info: ScaleInfo) => void;

  /**
   * Fired when the point size changes (either from a `setPointSize` call or at
   * engine init so React's initial state matches the engine's default).
   */
  onPointSizeChange?: (sizePx: number) => void;
  /**
   * Fired when the global brightness multiplier changes (either from a
   * `setBrightness` call or at engine init to seed React's initial state).
   */
  onBrightnessChange?: (value: number) => void;
  /**
   * Fired when auto-rotate is toggled (either from `setAutoRotate` or at
   * engine init so React knows the initial off state).
   */
  onAutoRotateChange?: (enabled: boolean) => void;
  /**
   * Fired when the level-of-detail mode changes (either from a `setLodMode`
   * call or at engine init to seed React's initial state).
   */
  onLodModeChange?: (mode: LodMode) => void;
  /**
   * Fired when the visible-source bitmask changes — either because auto-LOD
   * recomputed it after the camera distance crossed a band threshold, or
   * because `setSourceVisible` flipped a bit.
   *
   * Without this callback the React-side checkboxes can drift out of sync with
   * the engine's actual mask: at startup React initialises to `ALL_VISIBLE_MASK`,
   * but auto-LOD almost immediately reduces the engine mask based on the
   * initial camera distance.  The first user toggle then operates on a stale
   * React state and produces a visible no-op (the toggled bit was already in
   * the requested state on the engine side), forcing a second click.
   */
  onSourceMaskChange?: (mask: number) => void;
  /**
   * Fired each time a per-survey `.bin` file finishes loading and the cloud
   * has been uploaded to the renderer.  Surfaces progressive load state to
   * the React layer so the status bar can show e.g. "loaded 2/3 surveys".
   *
   * Why a granular per-source callback (rather than one final "all done"
   * event)?  The three .bin files run as parallel `fetch`es with very
   * different sizes (2MRS ~2 MB, SDSS ~23 MB, GLADE ~96 MB), so they land
   * minutes apart on slow connections.  Showing each one as it arrives lets
   * the user see and explore data progressively instead of staring at a
   * blank canvas until the largest survey finishes.
   *
   * Fires for the synthetic fallback too (when all three real fetches fail),
   * with `source = Source.Synthetic`, so subscribers don't need a separate
   * code path for the no-data case.
   */
  onCloudReady?: (source: Source, count: number) => void;
};
