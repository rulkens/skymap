import type { PointOfInterest } from '../subsystems/PointOfInterest';
import type { FocusableTarget } from '../FocusableTarget';

/**
 * EngineCameraHandle — viewpoint, tweens, and auto-rotate.
 *
 * Bundles the camera viewpoint operations the user invokes from React
 * (reset, focus-on-galaxy, focus-on-poi, focus-on-home, focus-on-milkyway),
 * the dev-only `logState` helper bound to the 'L' hotkey, and the auto-
 * rotate toggle (which is conceptually a camera behaviour, not a
 * points/tonemap setting).
 */
export type EngineCameraHandle = {
  /** Enable or disable the slow automatic camera yaw. */
  setAutoRotate: (enabled: boolean) => void;
  /** Snap the camera back to the initial framing computed at startup. */
  reset: () => void;
  /**
   * Smoothly tween the camera so the given target becomes the new orbit
   * focus.  Dispatches by type:
   *   - GalaxyInfo → the galaxy focus path (commitFocus + onFocusChange).
   *   - PointOfInterest → the POI focus path (commitPoiFocus, framing
   *     distance derived from the POI category + onPoiFocusChange).
   *
   * Discrimination uses the `isPoi` predicate from `services/engine/isPoi.ts`.
   * See `services/engine/helpers/dispatchFocusOn.ts` for the dispatcher
   * implementation.  Pre-bootstrap behaviour mirrors the per-kind paths:
   * galaxy focus is a no-op when `state.cam` is null; POI focus still
   * fires the subsystem flag + React-side callback even with no camera
   * (deep-link drains that race bootstrap rely on that).
   */
  focusOn: (target: FocusableTarget) => void;
  /**
   * Smoothly tween the camera so the given POI is centred at a per-
   * category framing distance (see `poiFocusDistanceMpc` for the
   * multipliers).  Also opens the InfoCard for the POI via the
   * `onPoiFocusChange` callback.  The POI subsystem's selection state
   * and the React-side callback fire even when `state.cam` is null
   * (pre-bootstrap / post-destroy) so a deep-link drain that races
   * bootstrap can establish the selected state before the camera is
   * live; only the camera tween itself is gated on cam availability.
   */
  focusOnPoi: (poi: PointOfInterest) => void;
  /**
   * Clear the POI focus: drop the selected-POI flag on the engine's POI
   * subsystem AND fire `onPoiFocusChange(null)` so React-side mirrors
   * (e.g. `focusedPoiId` driving `#poi=…` and the InfoCard POI body)
   * deselect in lock-step.  Camera does NOT move — clearing a POI
   * selection is a "close the card" gesture, not a "reset viewpoint"
   * one (the user explicitly invokes `reset` / `focusOnHome` for that).
   *
   * Idempotent: calling with no POI selected is a no-op.
   */
  clearPoiFocus: () => void;
  /** Smoothly tween back to the initial bootstrap framing. */
  focusOnHome: () => void;
  /** Tween to a viewpoint where the procedural Milky Way is dominant. */
  focusOnMilkyWay: () => void;
  /** Debug helper — log the live camera state for copy-paste tuning. */
  logState: () => void;
};
