/**
 * CameraDebugSnapshot — the DebugPanel Camera section's read-only payload,
 * built fresh per `debug.camera()` call (mirrors `EarthTileDebugSnapshot`'s
 * on-demand-read shape, not a pushed event). `null` before `wireInput` has
 * produced a live camera (mirrors `liveRenderCamera`'s own `null` case).
 *
 * Every field is a RAW value (Mpc, radians) — formatting into adaptive
 * units/degrees is the section component's job, same split as
 * `EarthTileAtlasSection`'s inline formatters.
 */

import type { Vec3 } from '../math/Vec3';
import type { OrientationFrameId } from '../camera/OrientationFrameId';

export type CameraDebugSnapshot = {
  readonly distanceMpc: number;
  /** Focused body's radius, Mpc — `null` when nothing focused has a surface. */
  readonly pivotRadiusMpc: number | null;
  readonly yawRad: number;
  readonly pitchRad: number;
  /** From `state.cam.roll` (the live drag register) — the produced pose carries no roll. */
  readonly rollRad: number;
  readonly targetMpc: Readonly<Vec3>;
  readonly positionMpc: Readonly<Vec3>;
  /** Which pole the camera currently treats as "up" — `state.settings.orientation`. */
  readonly orientationMode: OrientationFrameId;
  readonly surfaceFollowEngaged: boolean;
  /**
   * EYE-based altitude above the focused pivot's surface, Mpc — `null` when
   * nothing focused has a surface. Not `distance − pivotRadiusMpc`: the two
   * diverge the moment the pivot strafes off the body centre, which is exactly
   * what a zoom-to-cursor tick does (see `eyeAltitudeMpc`).
   */
  readonly altitudeMpc: number | null;
  /** The pivot's accumulated strafe (pan + zoom lateral), Mpc — `followPanWorld`, not the stored value. */
  readonly followPanOffsetMpc: Readonly<Vec3>;
  /** Last zoom tick's lateral pivot shift, Mpc. */
  readonly zoomLateralMpc: Readonly<Vec3>;
  /** Last computed `liveIdleTickMs` cadence, ms. */
  readonly idleTickMs: number;
};
