/**
 * EngineCallbacks — the seam between the imperative WebGPU engine and the
 * React UI. The engine calls these functions only when values actually change,
 * so React's setState can be passed in directly without spurious re-renders.
 */

import type { EngineStatus } from './EngineStatus';
import type { PointInfo } from './PointInfo';
import type { ScaleInfo } from './ScaleInfo';
import type { LodMode } from './LodMode';

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
};
