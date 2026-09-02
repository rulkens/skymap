import type { BodyId } from '../data/body/BodyId';
import type { PoseFrame } from './PoseFrame';
import type { Vec3 } from '../math/Vec3';

/**
 * CameraDebugSnapshot — the DebugPanel's "Camera" section readout (spec
 * 2026-09-01-camera-pivot §4/§6). Surfaces the branch's two known bug classes
 * (`armMismatch`, `epochMismatch`) plus the full orientation pipeline: the
 * roll's two references (configured scene up, body spin axis), the band's
 * blended target, and the input/gesture state driving them.
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
  /** Altitude above `engagedBodyId`'s surface, metres; null alongside `hOverR`. */
  readonly altitudeM: number | null;
  /** The rendered world pose's orbit distance, Mpc. */
  readonly distanceMpc: number;
  /** `settings.orientation` — the configured scene frame. */
  readonly orientationFrame: string;
  /** `maxTiltRad(hOverR)` — the tilt ceiling here; null with `hOverR`. */
  readonly ceilingRad: number | null;
  /** `bodyUpWeight(hOverR)` — BOTH arms' pole↔scene-up blend weight (ruling 10). */
  readonly bandUpWeight: number | null;
  /** Body-local heading/tilt of the rendered view (`headingTiltAt`); null off-roster. */
  readonly headingRad: number | null;
  readonly tiltRad: number | null;
  /** The pose's roll — 0 IS the configured scene up, by the roll convention. */
  readonly rollRad: number;
  /** The roll that would put the body spin axis up on screen; null when degenerate. */
  readonly poleRollRad: number | null;
  /** Wrapped `rollRad − poleRollRad` — residual to pure spin-axis alignment. */
  readonly rollToPoleRad: number | null;
  /** `bandRollTarget` — the band-blended target the notch ride follows. */
  readonly bandTargetRollRad: number | null;
  /** Wrapped `rollRad − bandTargetRollRad` — residual to the ride's target. */
  readonly rollToTargetRad: number | null;
  /** `cameraRuntime.lastRenderedSimDays.current` — the epoch last frame drew at. */
  readonly lastRenderedSimDays: number;
  /** The live clock's instant, resolved at read time (not what any frame drew). */
  readonly liveSimDays: number;
  /** `liveSimDays - lastRenderedSimDays`. */
  readonly epochDeltaDays: number;
  /** True when `epochDeltaDays` exceeds normal render-loop/poll drift. */
  readonly epochMismatch: boolean;
  /** Body-fixed anchor, metres, when `renderedFrame` is a body arm; else null. */
  readonly anchorLocalM: Vec3 | null;
  /** `|eyeRelAnchorM|`, metres, when `renderedFrame` is a body arm; else null. */
  readonly eyeRelAnchorMagM: number | null;
  /** `cameraRuntime.prevActiveId.current` — last frame's driver-table winner. */
  readonly activeDriverId: string;
  /** Latched gesture mode; 'down (unlatched)' between press and first step; null at rest. */
  readonly gestureMode: string | null;
  /** Whether the latched gesture holds a cursor ground hit; null without a latch. */
  readonly gestureCursorHit: boolean | null;
  /** 'in' | 'out' from the last zoom step's factor; null before the first notch. */
  readonly lastZoomDirection: 'in' | 'out' | null;
};
