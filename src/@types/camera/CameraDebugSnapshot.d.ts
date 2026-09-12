import type { CameraDofAngles } from './CameraDofAngles';
import type { OrientDeltas } from './OrientDeltas';
import type { PoseFrame } from './PoseFrame';
import type { Vec3 } from '../math/Vec3';

/** The DebugPanel's "Camera" section readout (spec 2026-09-01-camera-pivot §4/§6). */
export type CameraDebugSnapshot = {
  /** `camera.base.frame` — the regime itself. */
  readonly storedFrame: PoseFrame;
  /** `cameraRuntime.register.pose.frame` — the arm actually drawn last frame. */
  readonly renderedFrame: PoseFrame;
  readonly armMismatch: boolean;
  /** h/R for `dofs.bodyId`; null when no scene body resolved this instant. */
  readonly hOverR: number | null;
  /** Altitude above `dofs.bodyId`'s surface, metres; null alongside `hOverR`. */
  readonly altitudeM: number | null;
  readonly distanceMpc: number;
  /** `settings.orientation` — the configured scene frame. */
  readonly orientationFrame: string;
  /** `bodyUpWeight(hOverR)` — BOTH arms' pole↔scene-up blend weight (ruling 10). */
  readonly bandUpWeight: number | null;
  /** The session's Cesium-style remembered tilt (ruling 12), radians. */
  readonly rememberedTiltRad: number;
  /** Heading / tilt / roll as current-target-residual, radians. */
  readonly dofs: CameraDofAngles;
  /** The same three DOFs' per-FRAME motion; the 4 Hz poll cannot measure this. */
  readonly deltas: OrientDeltas;
  /** `cameraRuntime.outputs.simDays` — the epoch last frame drew at. */
  readonly lastRenderedSimDays: number;
  /** The live clock's instant, resolved at read time (not what any frame drew). */
  readonly liveSimDays: number;
  readonly epochDeltaDays: number;
  /** True when `epochDeltaDays` exceeds normal render-loop/poll drift. */
  readonly epochMismatch: boolean;
  /** Body-fixed anchor, metres, when `renderedFrame` is a body arm; else null. */
  readonly anchorLocalM: Vec3 | null;
  /** `|eyeRelAnchorM|`, metres, when `renderedFrame` is a body arm; else null. */
  readonly eyeRelAnchorMagM: number | null;
  /** `cameraRuntime.register.winner` — last frame's driver-table winner. */
  readonly activeDriverId: string;
  /** Latched gesture mode; 'down (unlatched)' between press and first step; null at rest. */
  readonly gestureMode: string | null;
  /** Whether the latched gesture holds a cursor ground hit; null without a latch. */
  readonly gestureCursorHit: boolean | null;
};
