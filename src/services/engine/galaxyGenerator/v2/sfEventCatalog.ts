/**
 * buildSfEventCatalog — the shared star-formation placement truth (design
 * doc N3): a pure function of (geometry, starFormation, seed) → flat SF-event
 * data. No engine state, no clock, no global RNG — this module is destined
 * for a Worker or a GPU compute pass so galaxies can keep generating in real
 * time while the camera navigates. Dust bubbles (this pass) and HII
 * star-forming knots (later, #20) both read this one catalog so cavities and
 * their glow correlate instead of being two independent sprinkles.
 */
import { mulberry32 } from '../../../../utils/random/mulberry32';
import {
  ARM_SPAN_START_FRAC,
  armCrossSigma,
  armFadeEnvelope,
  armRidgeCurvePoint,
} from './armRidgeGeometry';
import type { GalaxyDescription } from '../../../../@types/galaxy/GalaxyDescription';
import type { GalaxyFieldTuning } from '../../../../@types/galaxy/GalaxyFieldTuning';
import type { GalaxyStarFormationParams } from '../../../../@types/galaxy/GalaxyStarFormationParams';
import type { SfEvent } from '../../../../@types/galaxy/SfEvent';

/** Log-radius samples per arm, across that arm's whole span. */
const STEPS_PER_ARM = 64;

/** Runaway-sfActivity guard: never hand the shader more than this many events. */
const MAX_EVENTS = 512;

// Expected-events-per-step scale, empirically calibrated (scratchpad run
// against MILKY_WAY_GALAXY_PARAMS, its own seed) so sfActivity 1 lands the
// preset at ~125 events — inside the 120-180 target band.
const RATE_SCALE = 3;

function distance3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

export function buildSfEventCatalog(
  geometry: GalaxyDescription,
  starFormation: GalaxyStarFormationParams,
  tuning: GalaxyFieldTuning,
  seed: number,
): readonly SfEvent[] {
  const rng = mulberry32(seed);
  const events: SfEvent[] = [];

  geometry.arms.forEach((arm, armIndex) => {
    const logStart = Math.log(ARM_SPAN_START_FRAC);
    const logEnd = Math.log(arm.fadeRadius / geometry.armStartRadius);
    if (logEnd <= logStart) return;
    const step = (logEnd - logStart) / STEPS_PER_ARM;
    // Midpoint sample per step; arc length between consecutive step edges
    // approximates ds via the same ridge curve the blob placement walks —
    // reused, not re-derived.
    let edgePoint = armRidgeCurvePoint(logStart, geometry, arm);
    for (let i = 0; i < STEPS_PER_ARM; i++) {
      const logR = logStart + step * (i + 0.5);
      const radius = geometry.armStartRadius * Math.exp(logR);
      const nextEdgePoint = armRidgeCurvePoint(logStart + step * (i + 1), geometry, arm);
      const arcLength = distance3(edgePoint, nextEdgePoint);
      edgePoint = nextEdgePoint;

      const rate =
        RATE_SCALE *
        starFormation.sfActivity *
        (1 - 0.75 * arm.age) *
        armFadeEnvelope(radius, geometry, arm) *
        arcLength;

      if (rng() >= rate) continue;
      // Sum-of-2-uniforms is a cheap gaussian-ish draw (triangular, mean 0)
      // that keeps events inside the arm rather than at its sigma edge.
      const acrossOffset = (rng() + rng() - 1) * armCrossSigma(radius, geometry, tuning);
      events.push({ armIndex, logR, acrossOffset, age01: rng(), strength: 0.5 + rng() });
    }
  });

  events.sort((a, b) => a.armIndex - b.armIndex || a.logR - b.logR);
  return events.slice(0, MAX_EVENTS);
}
