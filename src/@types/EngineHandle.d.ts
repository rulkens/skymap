/**
 * EngineHandle — the public API surface returned by createEngine. Lets the
 * React layer drive the engine (clear selection, destroy, set visual params)
 * without knowing its internal structure.
 */

import type { LodMode } from './LodMode';
import type { Source } from '../data/sources';

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
   * Smoothly tween the camera so that `worldXYZ` becomes the new orbit target.
   *
   * The current yaw and pitch are preserved (the user keeps their orientation);
   * only `target` and `distance` change.  Distance tweens to a sensible viewing
   * range — for now a fixed multiple of the synthetic 30 kpc galaxy diameter
   * (a future task replaces the constant with the real `galaxyDiameterKpc`).
   *
   * Calling this while another tween is running cancels the previous tween and
   * starts a new one from the current camera state, so motion stays continuous.
   * If the world position is the origin and the camera is already there, the
   * call is a no-op.  Tween duration: 600 ms.
   */
  focusOn: (worldXYZ: [number, number, number]) => void;

  /**
   * Smoothly tween the camera back to the initial framing captured at engine
   * startup (target=origin, distance=bbox×2.5, yaw=0, pitch=0.3).
   *
   * Symmetric to `focusOn`: starts from the current state, eases over 600 ms,
   * cancels any running tween.  Always allowed — calling at home produces a
   * tiny no-op tween, never an error.
   */
  focusOnHome: () => void;

  /**
   * Set the level-of-detail rendering mode.
   *
   * In `'auto'` mode the engine recomputes the visible-source mask each frame
   * from `autoLodMask(camera.distance)`, so as the user zooms the surveys
   * fade in and out by themselves.  In `'manual'` mode the engine leaves the
   * mask alone, so whatever was last set by `setSourceVisible` (or the auto
   * mask at the moment of switch) stays put — this is the mode the survey
   * toggle UI uses.
   *
   * Also fires `onLodModeChange` so subscribed React state stays in sync.
   *
   * @param mode  'auto' lets the engine choose; 'manual' gives the caller control.
   */
  setLodMode?: (mode: LodMode) => void;

  /**
   * Toggle the visibility of a single survey.
   *
   * Implicitly switches the engine into `'manual'` LOD mode — the user
   * flicking a per-survey toggle is the clearest possible signal that they
   * want explicit control, so we don't make them call `setLodMode('manual')`
   * separately.  The change takes effect on the next rendered frame; the
   * renderer's per-source draw loop simply skips buffers whose bit is clear.
   *
   * No-op if `visible` already matches the current mask state for this source.
   */
  setSourceVisible?: (source: Source, visible: boolean) => void;

  /**
   * Prompt the WebHID device picker and open a paired SpaceMouse for input.
   *
   * Must be called from a user gesture (button click) — Chromium rejects
   * `requestDevice` outside one. Returns true if a device was successfully
   * opened, false on cancel / no device / error.
   *
   * No-op when the browser has no WebHID support — feature-detection happens
   * inside the input layer, so callers can invoke this without checking.
   */
  connectSpaceMouse?: () => Promise<boolean>;

  /**
   * Close the currently-open SpaceMouse, if any. Idempotent.
   *
   * Doesn't unpair the device — the user keeps their grant and a future
   * call to `connectSpaceMouse` will silently re-acquire without prompting.
   */
  disconnectSpaceMouse?: () => void;

  /** Whether a SpaceMouse is currently open and feeding input reports. */
  isSpaceMouseConnected?: () => boolean;

  /**
   * Set the SpaceMouse global sensitivity multiplier.
   *
   * Applied AFTER the cube response curve, so the curve shape doesn't
   * change — this just scales the whole motion budget. Default 1.0;
   * recommended range 0.1 – 3.0.
   */
  setSpaceMouseSensitivity?: (value: number) => void;
};
