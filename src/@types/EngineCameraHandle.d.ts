import type { PointInfo } from './PointInfo';

/**
 * EngineCameraHandle — viewpoint, tweens, and auto-rotate.
 *
 * Bundles the camera viewpoint operations the user invokes from React
 * (reset, focus-on-galaxy, focus-on-home, focus-on-milkyway), the dev-only
 * `logState` helper bound to the 'L' hotkey, and the auto-rotate toggle
 * (which is conceptually a camera behaviour, not a points/tonemap setting).
 */
export type EngineCameraHandle = {
  /** Enable or disable the slow automatic camera yaw. */
  setAutoRotate: (enabled: boolean) => void;
  /** Snap the camera back to the initial framing computed at startup. */
  reset: () => void;
  /** Smoothly tween the camera so the given galaxy becomes the new orbit target. */
  focusOn: (info: PointInfo) => void;
  /** Smoothly tween back to the initial bootstrap framing. */
  focusOnHome: () => void;
  /** Tween to a viewpoint where the procedural Milky Way is dominant. */
  focusOnMilkyWay: () => void;
  /** Debug helper — log the live camera state for copy-paste tuning. */
  logState: () => void;
};
