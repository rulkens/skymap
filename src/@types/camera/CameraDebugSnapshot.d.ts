import type { BodyId } from '../data/body/BodyId';
import type { PoseFrame } from './PoseFrame';
import type { Vec3 } from '../math/Vec3';

/**
 * CameraDebugSnapshot — the DebugPanel's "Camera" section readout (spec
 * 2026-09-01-camera-pivot §4/§6). Surfaces the two known bug classes this
 * branch introduces: `armMismatch` (stored regime vs. what actually rendered)
 * and `epochMismatch` (the render loop's clock lagging the live one).
 */
export type CameraDebugSnapshot = {
  /** `camera.base.frame` — the regime itself, per the store's own doc comment. */
  readonly storedFrame: PoseFrame;
  /** `cameraRuntime.lastPose.current.frame` — the arm actually drawn last frame. */
  readonly renderedFrame: PoseFrame;
  /** True when `storedFrame` and `renderedFrame` name different arms/bodies. */
  readonly armMismatch: boolean;
  /** The engaged body when `storedFrame` is a body arm, else the nearest roster body. */
  readonly engagedBodyId: BodyId | null;
  /** h/R for `engagedBodyId`; null when no scene body resolved this instant. */
  readonly hOverR: number | null;
  /** Altitude above `engagedBodyId`'s surface, km; null alongside `hOverR`. */
  readonly altitudeKm: number | null;
  /** `cameraRuntime.lastRenderedSimDays.current` — the epoch last frame drew at. */
  readonly lastRenderedSimDays: number;
  /** The live clock's instant, resolved at read time (not what any frame drew). */
  readonly liveSimDays: number;
  /** `liveSimDays - lastRenderedSimDays`. */
  readonly epochDeltaDays: number;
  /** True when `epochDeltaDays` exceeds normal render-loop/poll drift. */
  readonly epochMismatch: boolean;
  /** Body-fixed anchor, km, when `renderedFrame` is a body arm; else null. */
  readonly anchorLocalKm: Vec3 | null;
  /** `|eyeRelAnchorM|`, metres, when `renderedFrame` is a body arm; else null. */
  readonly eyeRelAnchorMagM: number | null;
  /** `cameraRuntime.prevActiveId.current` — last frame's driver-table winner. */
  readonly activeDriverId: string;
};
