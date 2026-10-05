/**
 * A quiet, self-consistent `CameraDebugSnapshot`: absolute arm, no engaged body,
 * both mismatch flags false. Panel tests spread it and override the handful of
 * values they actually assert on.
 */

import type { CameraDebugSnapshot } from '../../../src/@types/camera/CameraDebugSnapshot';
import { absoluteArm } from '../../../src/utils/camera/absoluteArm';

const ABSENT_DOF = { currentRad: null, targetRad: null, residualRad: null };
const QUIET_DELTA = { deltaRad: 0, peakAbsRad: 0 };

export const QUIET_CAMERA_DEBUG_SNAPSHOT: CameraDebugSnapshot = {
  storedFrame: 'absolute',
  framed: absoluteArm({ target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 }),
  armMismatch: false,
  hOverR: null,
  altitudeM: null,
  distanceMpc: 1,
  orientationFrame: 'ecliptic',
  bandUpWeight: null,
  rememberedTiltRad: 0,
  dofs: {
    bodyId: null,
    hOverR: null,
    heading: ABSENT_DOF,
    tilt: ABSENT_DOF,
    roll: ABSENT_DOF,
  },
  deltas: { heading: QUIET_DELTA, tilt: QUIET_DELTA, roll: QUIET_DELTA },
  lastRenderedSimDays: 0,
  liveSimDays: 0,
  epochDeltaDays: 0,
  epochMismatch: false,
  anchorLocalM: null,
  eyeRelAnchorMagM: null,
  sitePose: null,
  activeDriverId: 'resting',
  gestureMode: null,
  gestureCursorHit: null,
  terrainPickHeightM: null,
  residentHeightLevelAtEye: null,
};
