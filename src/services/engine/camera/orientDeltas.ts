/**
 * orientDeltas — how far each orientation DOF moved between the last two
 * FRAMES, plus the largest such step since the last clear. Fed by `runFrame`
 * once the displayed pose is final, at frame rate: the panel's 4 Hz poll
 * averages ~15 frames into one reading and hides exactly the defect this
 * exists for — a decay keyed to the wrong clock (per frame instead of per zoom
 * notch). Module state, not `cameraRuntime`: that has one writer by gate
 * (`cameraRuntimeSingleWriter.test.ts`) and this is not camera mechanism.
 * Δ is the pose's OWN motion, never a residual — but heading and tilt are
 * measured body-fixed, so a rotating body moves them under a still camera.
 */

import type { CameraDofAngles } from '../../../@types/camera/CameraDofAngles';
import type { OrientDeltas } from '../../../@types/camera/OrientDeltas';
import type { OrientDofDelta } from '../../../@types/camera/OrientDofDelta';
import { wrapRad } from '../../../utils/math/wrapRad';

type DofRecord = {
  prevRad: number | null;
  deltaRad: number;
  peakAbsRad: number;
};

function emptyDof(): DofRecord {
  return { prevRad: null, deltaRad: 0, peakAbsRad: 0 };
}

const RECORD: Record<keyof OrientDeltas, DofRecord> = {
  heading: emptyDof(),
  tilt: emptyDof(),
  roll: emptyDof(),
};

let watchers = 0;

/**
 * The panel's mount IS the gate. `prevRad` resets on subscribe: without it the
 * first frame back reports every radian flown while the panel was closed as one
 * frame's Δ, and that phantom then owns the peak column.
 */
export function watchOrientDeltas(): () => void {
  watchers += 1;
  for (const dof of Object.values(RECORD)) {
    dof.prevRad = null;
    dof.deltaRad = 0;
  }
  return () => {
    watchers -= 1;
  };
}

export function orientDeltasWatched(): boolean {
  return watchers > 0;
}

function step(dof: DofRecord, currentRad: number | null): void {
  const prevRad = dof.prevRad;
  dof.prevRad = currentRad;
  // A gap (off-roster, degenerate forward) breaks the chain rather than
  // reporting the whole gap as one frame's motion.
  if (currentRad === null || prevRad === null) {
    dof.deltaRad = 0;
    return;
  }
  dof.deltaRad = wrapRad(currentRad - prevRad);
  const absRad = Math.abs(dof.deltaRad);
  if (absRad > dof.peakAbsRad) dof.peakAbsRad = absRad;
}

export function recordOrientDeltas(angles: CameraDofAngles): void {
  step(RECORD.heading, angles.heading.currentRad);
  step(RECORD.tilt, angles.tilt.currentRad);
  step(RECORD.roll, angles.roll.currentRad);
}

export function clearOrientPeaks(): void {
  for (const dof of Object.values(RECORD)) dof.peakAbsRad = 0;
}

function frozen(dof: DofRecord): OrientDofDelta {
  return { deltaRad: dof.deltaRad, peakAbsRad: dof.peakAbsRad };
}

/** A value copy — the record keeps mutating under a panel that renders from it. */
export function readOrientDeltas(): OrientDeltas {
  return { heading: frozen(RECORD.heading), tilt: frozen(RECORD.tilt), roll: frozen(RECORD.roll) };
}
