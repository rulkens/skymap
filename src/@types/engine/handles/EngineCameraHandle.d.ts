import type { FocusableTarget } from '../FocusableTarget';

/**
 * EngineCameraHandle — viewpoint, tweens, and auto-rotate.
 *
 * Bundles the camera viewpoint operations the user invokes from React
 * (focus-on-target, focus-on-home), the dev-only `logState` helper
 * bound to the 'L' hotkey, and the auto-rotate toggle (which is
 * conceptually a camera behaviour, not a points/tonemap setting).
 */
export type EngineCameraHandle = {
  /** Enable or disable the slow automatic camera yaw. */
  setAutoRotate: (enabled: boolean) => void;
  /**
   * Smoothly tween the camera so the given target becomes the new orbit
   * focus.  Dispatches by type:
   *   - GalaxyInfo → the galaxy focus path (commitFocus + onFocusChange).
   *   - StructureInfo → the structure focus path (commitStructureFocus,
   *     framing distance derived from the category + onStructureFocusChange).
   *   - MilkyWayInfo → the Milky Way focus path (commitMilkyWayFocus, a tween
   *     to a viewpoint where the procedural impostor is dominant).
   *
   * Discrimination is a table lookup on `target.type` — see
   * `services/engine/helpers/commitFocus.ts` for the dispatcher
   * implementation.  Pre-bootstrap behaviour mirrors the per-kind paths:
   * galaxy focus is a no-op when `state.cam` is null; structure focus still
   * fires the subsystem flag + React-side callback even with no camera
   * (deep-link drains that race bootstrap rely on that).
   */
  focusOn: (target: FocusableTarget) => void;
  /** Smoothly tween back to the initial bootstrap framing. */
  focusOnHome: () => void;
  /** Debug helper — log the live camera state for copy-paste tuning. */
  logState: () => void;
};
