/**
 * EngineHandle — the public API surface returned by createEngine. Lets the
 * React layer drive the engine (clear selection, destroy, set visual params)
 * without knowing its internal structure.
 */

import type { LodMode } from './LodMode';

/**
 * Handle returned by `createEngine`. Allows the React layer to drive the
 * engine without knowing its internal structure.
 */
export type EngineHandle = {
  /**
   * Programmatically clear the current selection.
   *
   * No-op when nothing is selected. Fires `onSelectChange(null)` if a point
   * was selected. Used by the Esc key handler in `App.tsx`.
   */
  clearSelection: () => void;

  /**
   * Stop the render loop, release GPU resources, and detach all event listeners.
   *
   * Call this from React's `useEffect` cleanup so that hot-reload and
   * StrictMode double-mounts don't leave orphaned RAF loops or GPU objects.
   */
  destroy: () => void;

  /**
   * Set the billboard pixel radius for all rendered points.
   *
   * Takes effect on the next rendered frame. Also fires `onPointSizeChange`
   * so any subscribed React state stays in sync.
   *
   * @param sizePx  Point size in pixels. Recommended range: 1.0 – 8.0.
   */
  setPointSize: (sizePx: number) => void;

  /**
   * Set the global brightness multiplier applied to every star.
   *
   * A value of 1.0 is the neutral default. Values > 1 brighten the cloud;
   * values < 1 dim it. Also fires `onBrightnessChange`.
   *
   * @param value  Brightness multiplier. Recommended range: 0.2 – 3.0.
   */
  setBrightness: (value: number) => void;

  /**
   * Enable or disable the slow automatic camera yaw.
   *
   * When enabled, the camera yaws at ~3°/second each frame, creating a
   * gentle orbit effect. The user can still drag while auto-rotate is on —
   * both yaw contributions simply add together. Also fires `onAutoRotateChange`.
   *
   * @param enabled  True to start rotating, false to stop.
   */
  setAutoRotate: (enabled: boolean) => void;

  /**
   * Snap the camera back to the initial framing computed at startup.
   *
   * Restores: target = origin, distance = bbox × 2.5, yaw = 0, pitch = 0.3.
   * The reset takes effect on the next rendered frame.
   */
  resetCamera: () => void;

  /**
   * Set the level-of-detail rendering mode.
   *
   * Also fires `onLodModeChange` so subscribed React state stays in sync.
   *
   * @param mode  'auto' lets the engine choose; 'manual' gives the caller control.
   */
  setLodMode?: (mode: LodMode) => void;
};
