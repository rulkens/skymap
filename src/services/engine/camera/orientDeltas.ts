/**
 * orientDeltas — how far each orientation DOF moved between the last two
 * FRAMES, plus the largest such step since the last clear. Fed by `runFrame`
 * once the displayed pose is final, always on: the debug panel polls at 4 Hz,
 * which averages ~15 frames into one reading and hides exactly the defect this
 * exists for — a decay keyed to the wrong clock (per frame instead of per zoom
 * notch). Module state, not `cameraRuntime`: that has one writer by gate
 * (`cameraRuntimeSingleWriter.test.ts`) and this is not camera mechanism.
 * Δ tracks the pose's OWN motion, never a residual, so a target moving under a
 * still camera cannot read as something being pulled.
 */

import type { CameraDofAngles } from '../../../@types/camera/CameraDofAngles';
import type { OrientDeltas } from '../../../@types/camera/OrientDeltas';
import type { OrientDofDelta } from '../../../@types/camera/OrientDofDelta';
import { wrapRad } from '../../../utils/math/wrapRad';

type DofRecord = {
  prevRad: number | null;
  deltaRad: number;
  peakAbsRad: number;
  peakAtMs: number | null;
};

function emptyDof(): DofRecord {
  return { prevRad: null, deltaRad: 0, peakAbsRad: 0, peakAtMs: null };
}

const RECORD: Record<keyof OrientDeltas, DofRecord> = {
  heading: emptyDof(),
  tilt: emptyDof(),
  roll: emptyDof(),
};

function step(dof: DofRecord, currentRad: number | null, nowMs: number): void {
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
  if (absRad > dof.peakAbsRad) {
    dof.peakAbsRad = absRad;
    dof.peakAtMs = nowMs;
  }
}

export function recordOrientDeltas(angles: CameraDofAngles, nowMs: number): void {
  step(RECORD.heading, angles.heading.currentRad, nowMs);
  step(RECORD.tilt, angles.tilt.currentRad, nowMs);
  step(RECORD.roll, angles.roll.currentRad, nowMs);
}

export function clearOrientPeaks(): void {
  for (const dof of Object.values(RECORD)) {
    dof.peakAbsRad = 0;
    dof.peakAtMs = null;
  }
}

function frozen(dof: DofRecord): OrientDofDelta {
  return { deltaRad: dof.deltaRad, peakAbsRad: dof.peakAbsRad, peakAtMs: dof.peakAtMs };
}

/** A value copy — the record keeps mutating under a panel that renders from it. */
export function readOrientDeltas(): OrientDeltas {
  return { heading: frozen(RECORD.heading), tilt: frozen(RECORD.tilt), roll: frozen(RECORD.roll) };
}
