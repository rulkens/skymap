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
import type { EnginePickingState } from './state/EnginePickingState';

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
  readonly zoomBiasAnchor: EnginePickingState['zoomBiasAnchor'];
  /** This frame's applied zoom-bias eye-correction magnitude, metres — 0 when inactive. */
  readonly zoomBiasAppliedMeters: number;
  /** Last computed `liveIdleTickMs` cadence, ms. */
  readonly idleTickMs: number;
};
