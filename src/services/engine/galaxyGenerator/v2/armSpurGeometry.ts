/**
 * deriveArmSpurs / buildArmSpurs — interarm spurs ("feathers"): short
 * `GalaxyFieldArmRecord`s rooted at quasi-regular intervals along a parent
 * arm, so the wide interarm gap at larger radii isn't empty. Shape-compatible
 * with an ordinary arm record by construction, so the shared ridge vocabulary
 * (`armRidgeAngle`, `armRidgeCurvePoint`, `armRidgeFrameAt`, `armFadeEnvelope`)
 * renders a spur exactly like it renders an arm — nothing here re-derives a
 * curve. Rendering itself is `armSpurParticleCloud.ts`'s job; this module only
 * produces the records.
 *
 * PURITY INVARIANT: pure `(arm, geometry, tuning, rng) -> flat data`, no
 * `Math.random`/`Date`/engine state — same contract as every other `v2/`
 * builder (see `v2/README.md`).
 */
import { armRidgeAngle, armRidgeCurvePoint } from './armRidgeGeometry';
import { mulberry32 } from '../../../../utils/random/mulberry32';
import type { GalaxyArmSpurTuning } from '../../../../@types/galaxy/GalaxyArmSpurTuning';
import type { GalaxyFieldArmRecord } from '../../../../@types/galaxy/GalaxyFieldArmRecord';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { Vec3 } from '../../../../@types/math/Vec3';

/** Log-radius samples per parent arm's own span — same order of magnitude as `sfEventCatalog.ts`'s STEPS_PER_ARM, fine enough to track arc length without a curvature-adaptive bound (`deriveArmBlobCount`'s finer 192 exists for a stricter chord-sag tolerance this walk doesn't need). */
const SPUR_WALK_STEPS = 128;

/**
 * Root-spacing law: `w/h = FLOOR_H + SLOPE*(R/h)`, the same re-expression
 * idiom `armRidgeGeometry.ts`'s `armCrossSigma` uses for Reid et al. 2019's
 * width law, applied here to La Vigne, Vogel & Ostriker (2006)'s measured
 * feather spacing of 300-800 pc in nearby grand-design spirals (~0.12-0.31 of
 * the Milky Way's own 2.605 kpc disc scale length). The floor anchors the
 * inner-disc end of that range; the slope carries it past the upper end
 * at large radius, which is the point — spurs growing apart with radius is
 * what the arm cloud's own contrast law would predict "gets emptier" without
 * a filling feature.
 */
const SPUR_SPACING_FLOOR_H = 0.12;
const SPUR_SPACING_SLOPE = 0.03;

/** A spur is young by construction (post-shock gas, not the arm's own stellar population) — low floor, small spread, independent of the parent's own `age`. */
const SPUR_AGE_FLOOR = 0.05;
const SPUR_AGE_JITTER = 0.15;

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Physical root-to-root spacing at a radius — read by both the walk below and `armSpurParticleCloud.ts`'s size draw, so a spur's sprites size against the SAME gap its root spacing was drawn from. */
export function spurRootSpacing(
  radius: number,
  geometry: GalaxyDescription,
  tuning: GalaxyArmSpurTuning,
): number {
  return (
    (SPUR_SPACING_FLOOR_H * geometry.diskScaleLen + SPUR_SPACING_SLOPE * radius) *
    Math.max(tuning.spacing, 1e-3)
  );
}

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

/** "SPUR" — this tier's own rng salt, the `armParticleCloud.ts`/"ARMC" precedent. */
const ARM_SPUR_SEED_SALT = 0x53505552;

/**
 * Every arm's spurs, one rng stream advanced across arms in `geometry.arms`
 * order (not re-salted per arm) — the same "continue the stream" idiom
 * `describeGalaxy`'s `clumpStream`/`waveStream` use across their own arm
 * loop, so a change to arm count still reruns a deterministic prefix of the
 * same sequence rather than reshuffling every arm's spurs.
 */
export function buildArmSpurs(
  geometry: GalaxyDescription,
  tuning: GalaxyArmSpurTuning,
  seed: number,
): readonly GalaxyFieldArmRecord[] {
  if (!tuning.enabled || geometry.numArms <= 0) return [];
  const rng = mulberry32((seed ^ ARM_SPUR_SEED_SALT) >>> 0);
  const out: GalaxyFieldArmRecord[] = [];
  for (const arm of geometry.arms) {
    out.push(...deriveArmSpurs(arm, geometry, tuning, rng));
  }
  return out;
}
