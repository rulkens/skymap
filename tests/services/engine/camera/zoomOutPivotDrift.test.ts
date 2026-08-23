/**
 * Zoom-out pivot drift (bug trace, 2026-08-24).
 *
 * Reproduces the on-device report: zoom in on Earth, zoom back out, and the
 * focus centre walks off the body — far enough that at star scale Earth sits in
 * the wrong place and a further zoom-in converges on empty space.
 *
 * The loop is the at-rest wheel path as the engine actually runs it with Earth
 * focused (followBody wins, so the pivot is PINNED and the zoom's lateral is
 * routed into `clock.followPanStored`):
 *
 *   runFrame's surface-follow block  → engage / disengage / fold
 *   applyFocusedBodyPivot            → target = earth + followPanWorld(...)
 *   wireInput.onZoom                 → cursorZoomStep → addFollowPan
 *   applyWheelZoom (follow arm)      → followDistanceTarget *= distanceScale
 *
 * Three variants isolate the mechanism: the full loop, one with the sim clock
 * frozen (no body rotation ⇒ R̃ ≡ identity, no fold), and one that starts above
 * the engage band so surface follow never engages at all.
 */

import { describe, it, expect } from 'vitest';

import {
  createCameraClock,
  addFollowPan,
  followPanWorld,
} from '../../../../src/services/engine/camera/cameraClock';
import { applyFocusedBodyPivot } from '../../../../src/services/engine/camera/applyFocusedBodyPivot';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { surfaceFollowCorotation } from '../../../../src/services/engine/camera/surfaceFollowCorotation';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import {
  SURFACE_FOLLOW_ENGAGE_ALTITUDE_MPC,
  SURFACE_FOLLOW_DISENGAGE_ALTITUDE_MPC,
} from '../../../../src/services/engine/frame/runFrame';
import { cursorZoomStep } from '../../../../src/utils/camera/cursorZoomStep';
import { clampDistance } from '../../../../src/utils/camera/clampDistance';
import { eyeAltitudeMpc } from '../../../../src/utils/camera/eyeAltitudeMpc';
import { poseEyePositionMpc } from '../../../../src/utils/camera/poseEyePositionMpc';
import { reencodePose } from '../../../../src/utils/camera/reencodePose';
import { surfaceFollowEngaged } from '../../../../src/utils/camera/surfaceFollowEngaged';
import { multiply3x3 } from '../../../../src/utils/math/multiply3x3';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { CameraRuntime } from '../../../../src/@types/engine/state/CameraRuntime';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

const R_KM = 6371;
const R_MPC = R_KM * SCALE_UNITS.KM_TO_MPC;
const KM = (mpc: number): number => mpc / SCALE_UNITS.KM_TO_MPC;

const EARTH_ROW: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
  radiusKm: R_KM,
};

const CANVAS = { width: 800, height: 600 };
const PROJECTION: CameraProjection = {
  fovYRad: Math.PI / 3,
  aspect: CANVAS.width / CANVAS.height,
  near: 1e-20,
  far: 1e-12,
};
const POSE_BASIS = ORIENTATION_FRAMES.equatorial;

/** Off-centre but comfortably inside the globe's silhouette at every altitude. */
const CURSOR = { x: 470, y: 250 };
/** One desktop wheel notch: `Math.exp(deltaY * 0.001)` with deltaY = +100. */
const NOTCH_OUT = Math.exp(0.1);
const NOTCH_IN = Math.exp(-0.1);

const SIM_START = CONST_J2000 + 3652.5;
/** ~30 ms of sim time per tick — a real scroll's cadence. */
const TICK_DAYS = 0.03 / 86400;

type Sim = {
  clock: ReturnType<typeof createCameraClock>;
  surfaceFollow: CameraRuntime['surfaceFollow'];
  yaw: number;
  pitch: number;
  simDays: number;
};

function makeSim(altitudeKm: number, rotating: boolean): { sim: Sim; rotating: boolean } {
  const clock = createCameraClock();
  clock.followDistanceTarget = R_MPC + altitudeKm * SCALE_UNITS.KM_TO_MPC;
  return {
    sim: {
      clock,
      surfaceFollow: { engaged: false, orientationAtEngage: null, bodyId: null },
      // Non-polar sub-eye point (~20° N in the equatorial frame).
      yaw: 0.8,
      pitch: 0.35,
      simDays: SIM_START,
    },
    rotating,
  };
}

/**
 * One tick: the frame's surface-follow resolution + pivot pin, then the wheel
 * tick the engine would apply against the pose that frame rendered. Returns the
 * rendered pivot's offset from Earth's centre, in km.
 */
function tick(sim: Sim, factor: number, rotating: boolean): number {
  const { clock, surfaceFollow } = sim;
  const simDays = sim.simDays;
  const earth = deriveBodyStates(simDays).get('earth')!;

  const orbitPose: CameraPose = {
    target: [0, 0, 0],
    yaw: sim.yaw,
    pitch: sim.pitch,
    distance: clock.followDistanceTarget!,
  };

  // ── runFrame: engagement decision off the RAW stored pan ──────────────────
  const pivotEyePose = applyFocusedBodyPivot(
    orbitPose,
    true,
    EARTH_ROW,
    simDays,
    clock.followPanStored,
  );
  const poseEyeMpc = poseEyePositionMpc(pivotEyePose, POSE_BASIS);
  const altitudeMpc = eyeAltitudeMpc(poseEyeMpc, earth.positionMpc, R_MPC);

  const engagedSeed = surfaceFollow.bodyId === 'earth' ? surfaceFollow.engaged : false;
  const engagedNow = surfaceFollowEngaged(
    engagedSeed,
    altitudeMpc,
    SURFACE_FOLLOW_ENGAGE_ALTITUDE_MPC,
    SURFACE_FOLLOW_DISENGAGE_ALTITUDE_MPC,
  );
  const leavingCorotation =
    surfaceFollow.engaged && !engagedNow ? surfaceFollowCorotation(surfaceFollow, simDays) : null;
  surfaceFollow.engaged = engagedNow;
  surfaceFollow.bodyId = 'earth';
  if (!engagedNow) surfaceFollow.orientationAtEngage = null;
  else if (!engagedSeed) surfaceFollow.orientationAtEngage = [...earth.orientation] as Mat3;

  const corotation = surfaceFollowCorotation(surfaceFollow, simDays);
  const effectivePoseBasis = corotation === null ? POSE_BASIS : multiply3x3(corotation, POSE_BASIS);

  // ── runFrame: the disengage fold, exactly once ───────────────────────────
  let folded = orbitPose;
  if (leavingCorotation !== null) {
    clock.followPanStored = followPanWorld(clock, leavingCorotation);
    folded = reencodePose(folded, multiply3x3(leavingCorotation, POSE_BASIS), POSE_BASIS);
    sim.yaw = folded.yaw;
    sim.pitch = folded.pitch;
  }

  // ── runFrame: PIVOT-PIN ──────────────────────────────────────────────────
  const renderPose = applyFocusedBodyPivot(
    folded,
    true,
    EARTH_ROW,
    simDays,
    followPanWorld(clock, corotation),
  );

  // ── wireInput.onZoom, at rest, followBody owning the distance ────────────
  const zoomCam = assembleOrbitCamera(
    renderPose,
    PROJECTION,
    effectivePoseBasis,
    effectivePoseBasis,
  );
  const step = cursorZoomStep(
    zoomCam,
    CURSOR,
    CANVAS,
    { centreMpc: earth.positionMpc, radiusMpc: R_MPC },
    factor,
  );
  addFollowPan(clock, step.lateralMpc, corotation);
  clock.followDistanceTarget = clampDistance(clock.followDistanceTarget! * step.distanceScale);

  if (rotating) sim.simDays += TICK_DAYS;

  return KM(
    Math.hypot(
      renderPose.target[0] - earth.positionMpc[0],
      renderPose.target[1] - earth.positionMpc[1],
      renderPose.target[2] - earth.positionMpc[2],
    ),
  );
}

/** Eye altitude (km) the sim currently renders at, for the decade ledger. */
function altitudeKm(sim: Sim): number {
  const earth = deriveBodyStates(sim.simDays).get('earth')!;
  const pose = applyFocusedBodyPivot(
    {
      target: [0, 0, 0],
      yaw: sim.yaw,
      pitch: sim.pitch,
      distance: sim.clock.followDistanceTarget!,
    },
    true,
    EARTH_ROW,
    sim.simDays,
    followPanWorld(sim.clock, surfaceFollowCorotation(sim.surfaceFollow, sim.simDays)),
  );
  return KM(eyeAltitudeMpc(poseEyePositionMpc(pose, POSE_BASIS), earth.positionMpc, R_MPC));
}

/** Zoom out `ticks` notches, sampling the pivot offset at each decade of altitude. */
function zoomOut(
  sim: Sim,
  rotating: boolean,
  ticks: number,
): { ledger: string[]; maxOffsetKm: number } {
  const ledger: string[] = [];
  let nextDecade = 1e3;
  let maxOffsetKm = 0;
  for (let i = 0; i < ticks; i++) {
    const offsetKm = tick(sim, NOTCH_OUT, rotating);
    maxOffsetKm = Math.max(maxOffsetKm, offsetKm);
    const alt = altitudeKm(sim);
    while (alt >= nextDecade) {
      ledger.push(
        `alt ${nextDecade.toExponential(0)} km → pivot offset ${offsetKm.toExponential(3)} km ` +
          `(${(offsetKm / R_KM).toExponential(2)} R⊕)`,
      );
      nextDecade *= 10;
    }
  }
  return { ledger, maxOffsetKm };
}

describe('zoom-out pivot drift — the focus centre walks off Earth', () => {
  it('compounds proportionally to distance: the pivot offset grows one decade per altitude decade', () => {
    const { sim, rotating } = makeSim(100, true);
    const { ledger, maxOffsetKm } = zoomOut(sim, rotating, 400);

    // eslint-disable-next-line no-console
    console.log('FULL LOOP (rotating, engage→disengage):\n' + ledger.join('\n'));

    // The pivot is the point the camera orbits and the point a cursor-miss zoom
    // converges on. It must stay ON the body it is pinned to.
    expect(maxOffsetKm).toBeLessThan(R_KM);
  });

  it('a frozen sim clock (R̃ ≡ identity, no fold) drifts identically — rotation is not the cause', () => {
    const { sim } = makeSim(100, false);
    const { ledger, maxOffsetKm } = zoomOut(sim, false, 400);

    // eslint-disable-next-line no-console
    console.log('FROZEN CLOCK (no co-rotation):\n' + ledger.join('\n'));

    expect(maxOffsetKm).toBeLessThan(R_KM);
  });

  it('never engaging surface follow drifts identically — the hysteresis band is not the cause', () => {
    // Start well above the ~241 km disengage altitude: `surfaceFollowEngaged`
    // never flips true, so no snapshot, no R̃, no fold — pure zoom path.
    const { sim, rotating } = makeSim(5000, true);
    const { ledger, maxOffsetKm } = zoomOut(sim, rotating, 400);
    expect(sim.surfaceFollow.engaged).toBe(false);

    // eslint-disable-next-line no-console
    console.log('NEVER ENGAGED (no surface follow at all):\n' + ledger.join('\n'));

    expect(maxOffsetKm).toBeLessThan(R_KM);
  });

  it('zooming back in leaves the pivot off Earth, so the descent converges on empty space', () => {
    const { sim, rotating } = makeSim(100, true);
    zoomOut(sim, rotating, 260);
    const outOffsetKm = tick(sim, 1, rotating);

    // Back in the same number of notches, cursor unmoved.
    for (let i = 0; i < 260; i++) tick(sim, NOTCH_IN, rotating);
    const backOffsetKm = tick(sim, 1, rotating);

    // eslint-disable-next-line no-console
    console.log(
      `round trip: out-offset ${outOffsetKm.toExponential(3)} km, ` +
        `back-offset ${backOffsetKm.toExponential(3)} km, ` +
        `final altitude ${altitudeKm(sim).toExponential(3)} km`,
    );

    expect(backOffsetKm).toBeLessThan(R_KM);
  });
});
