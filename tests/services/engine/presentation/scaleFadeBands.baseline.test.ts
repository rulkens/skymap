/**
 * TEMPORARY refactor harness — s-star prep-02 Task 1
 * (docs/superpowers/plans/2026-07-30-s-star-prep-02-body-regions.md).
 *
 * Pins today's eight near-field band-edge scalars, bit-for-bit, so Tasks 2–6
 * can move HOW each is derived without moving WHAT it evaluates to. This is
 * deliberately a constant-restatement test, which
 * docs/superpowers/conventions/testing.md normally forbids — it is justified
 * ONLY as a scaffold and Task 7 deletes it. Do not cite it as precedent for a
 * permanent test.
 *
 * Literals were computed by hand from the source derivation chain (Eta
 * Carinae `distancePc: 2300`, Neptune's J2000 Keplerian elements, the
 * `SCALE_UNITS` conversion constants) — never by importing the formula under
 * test — so a real shift in any of them fails this file. The Mpc values here
 * span from ~1e-1 (FOREGROUND_MAX_DISTANCE_MPC) down to ~1e-10
 * (bodyGlintBackdrop), so the "normal" magnitudes use `toBeCloseTo` against a
 * human-readable decimal, and the sub-nanoparsec ones use a relative
 * `actual / literal ≈ 1` check instead — an absolute `toBeCloseTo` digit
 * count can't stay both tight and readable across nine orders of magnitude.
 */

import { describe, it, expect } from 'vitest';

import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/solarSystemLabelMaxDistance';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/services/engine/frame/foregroundMaxDistance';
import {
  SCALE_FADE_BANDS,
  FARTHEST_STAR_PC,
} from '../../../../src/services/engine/presentation/scaleFadeBands';
import { orbitReachByRegion } from '../../../../src/services/engine/frame/passes/orbitTrailsLayer';
import { SCENE_ANCHORS } from '../../../../src/data/bodies/sceneAnchors';
import { ORBITAL_ELEMENTS } from '../../../../src/data/bodies/orbitalElements';
import { BODY_REGIONS } from '../../../../src/data/bodies/bodyRegions';
import { regionOfBody } from '../../../../src/utils/scene/regionOfBody';

// Relative check for values whose magnitude (down to ~1e-10 Mpc, the
// solar-system's own AU-to-lunar scale) makes a decimal-digit `toBeCloseTo`
// either untunable or vacuous — see the file header.
function expectCloseRelative(actual: number, literal: number): void {
  expect(actual / literal).toBeCloseTo(1, 12);
}

describe('near-field band edges — Task 1 regression baseline (TEMPORARY, deleted in Task 7)', () => {
  it('SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC — FARTHEST_BODY_MPC (Eta Carinae, 2300 pc) × 4', () => {
    expect(SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC).toBeCloseTo(0.0092, 12);
  });

  it('FOREGROUND_MAX_DISTANCE_MPC — FARTHEST_BODY_MPC × 100', () => {
    expect(FOREGROUND_MAX_DISTANCE_MPC).toBeCloseTo(0.23, 12);
  });

  it('SCALE_FADE_BANDS.starBackdrop.fullAt — FARTHEST_BODY_MPC × 2', () => {
    expect(SCALE_FADE_BANDS.starBackdrop.fullAt).toBeCloseTo(0.0046, 12);
  });

  it('SCALE_FADE_BANDS.starBackdrop.goneAt — FARTHEST_BODY_MPC × 10', () => {
    expect(SCALE_FADE_BANDS.starBackdrop.goneAt).toBeCloseTo(0.023, 12);
  });

  it('SCALE_FADE_BANDS.bodyGlintBackdrop.fullAt — FARTHEST_PLANET_MPC (Neptune @ J2000) × 2', () => {
    expectCloseRelative(SCALE_FADE_BANDS.bodyGlintBackdrop.fullAt, 2.9202559308918254e-10);
  });

  it('SCALE_FADE_BANDS.bodyGlintBackdrop.goneAt — FARTHEST_PLANET_MPC × 10', () => {
    expectCloseRelative(SCALE_FADE_BANDS.bodyGlintBackdrop.goneAt, 1.4601279654459127e-9);
  });

  it('orbitReachByRegion(solar-system) — Neptune apoapsis a·(1+e), the chain-wide reach envelope', () => {
    const solarSystemRegion = BODY_REGIONS.find((region) => region.id === 'solar-system')!;
    const reach = orbitReachByRegion(SCENE_ANCHORS, ORBITAL_ELEMENTS, regionOfBody).get(
      solarSystemRegion,
    )!;
    expectCloseRelative(reach, 1.4703544623962364e-10);
  });

  it('FARTHEST_STAR_PC — FARTHEST_BODY_MPC round-tripped back through PC_TO_MPC', () => {
    expect(FARTHEST_STAR_PC).toBeCloseTo(2300, 6);
  });
});
