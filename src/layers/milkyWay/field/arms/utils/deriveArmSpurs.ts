/**
 * deriveArmSpurs — one parent arm's interarm spurs: roots dropped at jittered
 * quasi-regular arc-length spacing, each curve continuous with the parent's at
 * its root. Shape-compatible with an arm record, so the ridge vocabulary renders it.
 */
import { armRidgeAngle } from './armRidgeAngle';
import { distance3 } from '../../../../../utils/math/distance3';
import type { GalaxyArmSpurTuning } from '../@types/GalaxyArmSpurTuning';
import type { GalaxyFieldArmRecord } from '../../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../../@types/galaxy/GalaxyDescription';
import { armRidgeCurvePoint } from './armRidgeCurvePoint';
import { spurRootSpacing } from './spurRootSpacing';

/** Log-radius samples per parent arm's own span — same order of magnitude as `sfEventCatalog.ts`'s STEPS_PER_ARM, fine enough to track arc length without a curvature-adaptive bound (`deriveArmBlobCount`'s finer 192 exists for a stricter chord-sag tolerance this walk doesn't need). */
const SPUR_WALK_STEPS = 128;

/** A spur is young by construction (post-shock gas, not the arm's own stellar population) — low floor, small spread, independent of the parent's own `age`. */
const SPUR_AGE_FLOOR = 0.05;

const SPUR_AGE_JITTER = 0.15;

function buildSpurRecord(
  logR: number,
  radius: number,
  arm: GalaxyFieldArmRecord,
  geometry: GalaxyDescription,
  tuning: GalaxyArmSpurTuning,
  rng: () => number,
): GalaxyFieldArmRecord {
  // Continuity at the root: with meanderAmp and every wave lane zeroed below,
  // armRidgeAngle(logR, geometry, spur) reduces to phase + pitch*logR exactly
  // (no approximation), so solving phase = parentAngle - pitch*logR makes the
  // two curves meet EXACTLY at (logR, parentAngle) — not just close.
  const parentAngle = armRidgeAngle(logR, geometry, arm);
  // DIVIDED, not multiplied: `pitch` here is d(angle)/d(logR) ~ cot of the
  // astronomer's pitch ANGLE, so a feather that opens toward radial (La
  // Vigne+06: spurs run more OPEN than their parent) needs a SMALLER
  // coefficient. Multiplying winds the spur tighter than the arm — it hugs
  // the ridge instead of reaching into the interarm gap.
  const pitch = arm.pitch / Math.max(tuning.pitchRatio, 1e-3);
  const phase = parentAngle - pitch * logR;
  const gap = spurRootSpacing(radius, geometry, tuning);
  const fadeRadius = radius + Math.max(0, tuning.lengthFrac) * gap;
  return {
    phase,
    pitch,
    // Unread by anything a spur reaches (pushArmRidges never sees a spur
    // record, v1 packing never sees one either) — 1 keeps the field's own
    // type contract satisfied rather than smuggling a meaningless 0 through.
    weight: 1,
    fadeRadius,
    spanStartLogR: logR,
    meanderAmp: 0,
    meanderFreq: 0,
    meanderPhase: 0,
    age: SPUR_AGE_FLOOR + SPUR_AGE_JITTER * rng(),
    clumpF1: 0,
    clumpP1: 0,
    clumpF2: 0,
    clumpP2: 0,
    waveF1: 0,
    waveP1: 0,
    waveF2: 0,
    waveP2: 0,
  };
}

/**
 * Walks `arm`'s own rendered span (`arm.spanStartLogR` to its `fadeRadius`)
 * in arc length, dropping a root whenever the accumulated distance since the
 * last one crosses a jittered `spurRootSpacing` target — a renewal process,
 * so gaps cluster around the spacing law but never collapse to zero or run
 * away. Returns roots in increasing `logR` (== increasing arc length, since
 * the walk itself is monotonic in `logR`).
 */
export function deriveArmSpurs(
  arm: GalaxyFieldArmRecord,
  geometry: GalaxyDescription,
  tuning: GalaxyArmSpurTuning,
  rng: () => number,
): readonly GalaxyFieldArmRecord[] {
  const logStart = arm.spanStartLogR;
  const logEnd = Math.log(arm.fadeRadius / geometry.armStartRadius);
  if (!(logEnd > logStart)) return [];

  const step = (logEnd - logStart) / SPUR_WALK_STEPS;
  const jitter = Math.max(0, tuning.jitter);
  const jitteredSpacing = (radius: number): number =>
    spurRootSpacing(radius, geometry, tuning) * (1 + jitter * (2 * rng() - 1));

  const spurs: GalaxyFieldArmRecord[] = [];
  let arcSinceRoot = 0;
  let nextTarget = jitteredSpacing(geometry.armStartRadius * Math.exp(logStart));
  let prevPoint = armRidgeCurvePoint(logStart, geometry, arm);

  for (let i = 1; i <= SPUR_WALK_STEPS; i++) {
    const logR = logStart + step * i;
    const radius = geometry.armStartRadius * Math.exp(logR);
    const point = armRidgeCurvePoint(logR, geometry, arm);
    arcSinceRoot += distance3(prevPoint, point);
    prevPoint = point;

    if (arcSinceRoot >= nextTarget) {
      spurs.push(buildSpurRecord(logR, radius, arm, geometry, tuning, rng));
      arcSinceRoot = 0;
      nextTarget = jitteredSpacing(radius);
    }
  }
  return spurs;
}
