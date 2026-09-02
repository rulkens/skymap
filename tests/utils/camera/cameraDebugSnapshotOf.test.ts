/**
 * cameraDebugSnapshotOf — covers the two cross-checks the DebugPanel's
 * "Camera" section exists for (armMismatch, epochMismatch), plus the
 * engaged-vs-nearest h/R choice and the body-arm-only anchor/eye readout.
 * Geometry setup mirrors `regimeArmFor.test.ts` (body-at-origin, eye on +x).
 */

import { describe, it, expect } from 'vitest';

import { cameraDebugSnapshotOf } from '../../../src/utils/camera/cameraDebugSnapshotOf';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../src/@types/camera/CameraPose';
import type { FramedCameraPose } from '../../../src/@types/camera/FramedCameraPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { TimeState } from '../../../src/@types/time/TimeState';
import type { Vec3 } from '../../../src/@types/math/Vec3';

const EARTH_RADIUS_M = 6371000;
const MOON_RADIUS_M = 1737000;
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// Live mode's tolerance (`deriveSimDays` advances 1 sim-day per real-day)
// reduces to the branch's original fixed constant, so every pre-existing
// assertion below keeps its exact original threshold under this fixture.
const LIVE_TIME: TimeState = {
  mode: 'live',
  anchor: { simDays: 0, realMs: 0 },
  rateIndex: 0,
  direction: 1,
  paused: false,
};

const m = (metres: number): number => metres * SCALE_UNITS.M_TO_MPC;
const bodyId = (id: string): BodyId => id as BodyId;

/** Eye placed via a zero-distance pose; forward is degenerate on purpose —
 * these tests pin the regime/epoch fields, not the orientation pipeline. */
function poseWithEye(eyeMpc: Vec3): CameraPose {
  return { target: eyeMpc, yaw: 0, pitch: 0, distance: 0 };
}

/** The new-in-round-4 inputs the pre-existing assertions never read. */
const SNAP_COMMON = {
  poseBasis: IDENTITY,
  upBasis: IDENTITY,
  orientationFrame: 'ecliptic',
  gesture: null,
  lastZoomFactor: null,
} as const;

function bodyState(positionMpc: Vec3): BodyState {
  return { positionMpc, orientation: IDENTITY, meanAnomalyRad: 0 };
}

function eyeAt(radiusM: number, hOverR: number): Vec3 {
  return [m(radiusM * (1 + hOverR)), 0, 0];
}

const ABSOLUTE_POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };

function absoluteFramed(): FramedCameraPose {
  return { frame: 'absolute', pose: ABSOLUTE_POSE };
}

function bodyFramed(id: BodyId, anchorLocalM: Vec3, eyeRelAnchorM: Vec3): FramedCameraPose {
  const pose: BodyFixedPose = { bodyId: id, anchorLocalM, eyeRelAnchorM, basisLocal: IDENTITY };
  return { frame: { body: id }, pose };
}

describe('cameraDebugSnapshotOf', () => {
  it('reports no mismatch when stored and rendered agree (both absolute)', () => {
    const snap = cameraDebugSnapshotOf({
      storedFrame: 'absolute',
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 2.0)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(snap.armMismatch).toBe(false);
  });

  it('reports no mismatch when stored and rendered agree on the same body', () => {
    const snap = cameraDebugSnapshotOf({
      storedFrame: { body: bodyId('earth') },
      renderedPose: bodyFramed(bodyId('earth'), [0, 0, 0], [1, 0, 0]),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 0.5)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(snap.armMismatch).toBe(false);
  });

  it('flags a mismatch when the stored regime and the rendered arm disagree', () => {
    const snap = cameraDebugSnapshotOf({
      storedFrame: { body: bodyId('earth') },
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 0.5)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(snap.armMismatch).toBe(true);
  });

  it('flags a mismatch between two different engaged bodies', () => {
    const snap = cameraDebugSnapshotOf({
      storedFrame: { body: bodyId('earth') },
      renderedPose: bodyFramed(bodyId('moon'), [0, 0, 0], [1, 0, 0]),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 0.5)),
      bodyStates: new Map([
        [bodyId('earth'), bodyState([0, 0, 0])],
        [bodyId('moon'), bodyState([m(EARTH_RADIUS_M * 5), 0, 0])],
      ]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(snap.armMismatch).toBe(true);
  });

  it('holds epoch delta within the healthy poll/heartbeat floor as no mismatch', () => {
    const snap = cameraDebugSnapshotOf({
      storedFrame: 'absolute',
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 2.0)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100 + 0.5 / 86_400,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(snap.epochMismatch).toBe(false);
  });

  it('flags a multi-second epoch gap as a mismatch', () => {
    const snap = cameraDebugSnapshotOf({
      storedFrame: 'absolute',
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 2.0)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100 + 10 / 86_400,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(snap.epochMismatch).toBe(true);
    expect(snap.epochDeltaDays).toBeCloseTo(10 / 86_400, 9);
  });

  it('reads h/R off the ENGAGED body, not the roster-wide nearest', () => {
    // Moon is nearer in h/R (0.5 R vs Earth's 1.0 R), but Earth is the
    // stored regime — the engaged body always wins over "nearest".
    const snap = cameraDebugSnapshotOf({
      storedFrame: { body: bodyId('earth') },
      renderedPose: bodyFramed(bodyId('earth'), [0, 0, 0], [m(EARTH_RADIUS_M * 2), 0, 0]),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 1.0)),
      bodyStates: new Map([
        [bodyId('earth'), bodyState([0, 0, 0])],
        [bodyId('moon'), bodyState([m(MOON_RADIUS_M * -1.5), 0, 0])],
      ]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(snap.engagedBodyId).toBe('earth');
    expect(snap.hOverR).toBeCloseTo(1.0, 6);
    expect(snap.altitudeM).toBeCloseTo(EARTH_RADIUS_M, 0);
  });

  it('falls back to the roster-wide nearest body while in the absolute arm', () => {
    const snap = cameraDebugSnapshotOf({
      storedFrame: 'absolute',
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      worldPose: poseWithEye([m(MOON_RADIUS_M * 1.5), 0, 0]),
      bodyStates: new Map([
        [bodyId('earth'), bodyState([m(EARTH_RADIUS_M * 5), 0, 0])],
        [bodyId('moon'), bodyState([0, 0, 0])],
      ]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(snap.engagedBodyId).toBe('moon');
  });

  it('carries anchor/eye readout only on a body-arm rendered pose', () => {
    const withBody = cameraDebugSnapshotOf({
      storedFrame: { body: bodyId('earth') },
      renderedPose: bodyFramed(bodyId('earth'), [1000, 2000, 3000], [3, 4, 0]),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 1.0)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(withBody.anchorLocalM).toEqual([1000, 2000, 3000]);
    expect(withBody.eyeRelAnchorMagM).toBeCloseTo(5, 6);

    const absolute = cameraDebugSnapshotOf({
      storedFrame: 'absolute',
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 2.0)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
    });
    expect(absolute.anchorLocalM).toBeNull();
    expect(absolute.eyeRelAnchorMagM).toBeNull();
  });

  it('scales the epoch-mismatch floor to the active time-ladder rate (I4)', () => {
    // rateIndex 6 = '1 day/s' (86_400 simSecPerRealSec): a routine ~250 ms
    // poll gap advances the sim by ~0.25 days, four orders over the OLD fixed
    // real-time-tuned constant — this must still read healthy at this rate.
    const fastTime: TimeState = {
      mode: 'manual',
      anchor: { simDays: 0, realMs: 0 },
      rateIndex: 6,
      direction: 1,
      paused: false,
    };

    const healthy = cameraDebugSnapshotOf({
      storedFrame: 'absolute',
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 2.0)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100.25,
      time: fastTime,
      activeDriverId: 'resting',
    });
    expect(healthy.epochMismatch).toBe(false);

    // 10 sim-days at this rate is ~10 real-seconds of actual stall — still a
    // genuine mismatch, not swallowed by the widened floor.
    const stalled = cameraDebugSnapshotOf({
      storedFrame: 'absolute',
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      worldPose: poseWithEye(eyeAt(EARTH_RADIUS_M, 2.0)),
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 110,
      time: fastTime,
      activeDriverId: 'resting',
    });
    expect(stalled.epochMismatch).toBe(true);
  });

  it('derives a self-consistent orientation pipeline for a real in-band pose', () => {
    // The round-4 readout: the residual columns the user pastes back must be
    // the wrapped differences of the raw columns beside them, and the band
    // scalars must come off the one curve — a wiring slip here would send us
    // debugging fabricated numbers.
    const eye = eyeAt(EARTH_RADIUS_M, 2.0);
    const snap = cameraDebugSnapshotOf({
      storedFrame: 'absolute',
      renderedPose: absoluteFramed(),
      ...SNAP_COMMON,
      // A REAL pose (non-degenerate forward): eye out on +x looking at the body.
      worldPose: { target: [0, 0, 0], yaw: Math.PI / 2, pitch: 0, distance: eye[0], roll: 0.3 },
      bodyStates: new Map([[bodyId('earth'), bodyState([0, 0, 0])]]),
      lastRenderedSimDays: 100,
      liveSimDays: 100,
      time: LIVE_TIME,
      activeDriverId: 'resting',
      lastZoomFactor: 1.2,
    });

    expect(snap.rollRad).toBe(0.3);
    expect(snap.lastZoomDirection).toBe('out');
    expect(snap.bandAuthority).toBeGreaterThan(0);
    expect(snap.bandAuthority).toBeLessThan(1);
    expect(snap.ceilingRad).toBeCloseTo(snap.bandAuthority! * Math.PI, 12);
    expect(snap.tiltRad).toBeCloseTo(0, 6); // looking straight at the centre
    expect(snap.poleRollRad).not.toBeNull();
    expect(snap.rollToPoleRad).toBeCloseTo(0.3 - snap.poleRollRad!, 6);
    expect(snap.bandTargetRollRad).not.toBeNull();
    expect(snap.rollToTargetRad).toBeCloseTo(0.3 - snap.bandTargetRollRad!, 6);
  });
});
