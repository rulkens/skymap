import type { FocusableTarget } from '../FocusableTarget';

/**
 * EngineCameraHandle — viewpoint, tweens, and auto-rotate.
 *
 * Bundles the camera viewpoint operations the user invokes from React
 * (reset, focus-on-target, focus-on-home, focus-on-milkyway),
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
   *   - StructureRecord → the structure focus path (commitStructureFocus,
   *     framing distance derived from the category + onStructureFocusChange).
   *
   * Discrimination uses the `isStructure` predicate from `services/engine/isStructure.ts`.
   * See `services/engine/helpers/dispatchFocusOn.ts` for the dispatcher
   * implementation.  Pre-bootstrap behaviour mirrors the per-kind paths:
   * galaxy focus is a no-op when `state.cam` is null; structure focus still
   * fires the subsystem flag + React-side callback even with no camera
   * (deep-link drains that race bootstrap rely on that).
   */
  focusOn: (target: FocusableTarget) => void;
  /** Smoothly tween back to the initial bootstrap framing. */
  focusOnHome: () => void;
  /** Tween to a viewpoint where the procedural Milky Way is dominant. */
  focusOnMilkyWay: () => void;
  /** Debug helper — log the live camera state for copy-paste tuning. */
  logState: () => void;
};
