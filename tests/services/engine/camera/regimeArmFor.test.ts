/**
 * regimeArmFor — the regime predicate (spec §4, §12-R2). Every fixture places
 * a body at the Mpc origin with the identity orientation, so the eye's
 * distance from the body is just its own magnitude and `h/R` follows from
 * `SCENE_BODIES`' `radiusM` directly — no Earth-typed constant anywhere in
 * this file, matching the body-blind predicate under test.
 *
 * Fixture ids ('moon', 'deimos') are widened to `BodyId` the same way
 * `slabs.ts`/`resolvePickTable.ts` already do at the individual-`SceneBody`
 * boundary (`id as BodyId`): the registry type is a 5-value settings category,
 * narrower than the ~30 individual bodies `SCENE_BODIES` actually seeds.
 */

import { describe, it, expect } from 'vitest';

import { regimeArmFor } from '../../../../src/services/engine/camera/regimeArmFor';
import { SURFACE_REGIME } from '../../../../src/data/camera/surfaceRegime';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../src/@types/math/Mat3';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';

const EARTH_RADIUS_M = 6371000;
const DEIMOS_RADIUS_M = 6000;
const MOON_RADIUS_M = 1737000;

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const m = (metres: number): number => metres * SCALE_UNITS.M_TO_MPC;
const bodyId = (id: string): BodyId => id as BodyId;

function bodyState(positionMpc: Vec3): BodyState {
  return { positionMpc, orientation: IDENTITY, meanAnomalyRad: 0 };
}

// Body-at-origin: the eye's Mpc magnitude alone sets the altitude, so
// `hOverR` below is exact arithmetic, not a fixture approximation.
function bodyStateAtOrigin(): BodyState {
  return bodyState([0, 0, 0]);
}

// eye at `hOverR` altitude ratios above a body of `radiusM`, along +x.
function eyeAt(radiusM: number, hOverR: number): Vec3 {
  return [m(radiusM * (1 + hOverR)), 0, 0];
}

describe('regimeArmFor', () => {
  it('engages the nearest body below 1.7 R', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const next = regimeArmFor('absolute', eyeAt(EARTH_RADIUS_M, 1.0), bodyStates, null);
    expect(next).toEqual({ body: 'earth' });
  });

  it('holds the world arm above 1.7 R', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const next = regimeArmFor('absolute', eyeAt(EARTH_RADIUS_M, 2.0), bodyStates, null);
    expect(next).toBe('absolute');
  });

  it('holds an engaged body arm until 3.4 R, from both directions', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const current = { body: bodyId('earth') };

    // Approaching disengage from below (h/R rising through the engaged band).
    expect(regimeArmFor(current, eyeAt(EARTH_RADIUS_M, 1.0), bodyStates, null)).toEqual(current);
    expect(regimeArmFor(current, eyeAt(EARTH_RADIUS_M, 3.3), bodyStates, null)).toEqual(current);
    // Crossing disengage releases the arm.
    expect(regimeArmFor(current, eyeAt(EARTH_RADIUS_M, 3.5), bodyStates, null)).toBe('absolute');

    // Symmetric check from a fresh high altitude directly (the "from both
    // directions" half — the predicate holds the SAME regardless of how the
    // pose arrived at that h/R, since it reads only current + geometry).
    expect(regimeArmFor(current, eyeAt(EARTH_RADIUS_M, 2.5), bodyStates, null)).toEqual(current);
  });

  it('picks the minimising body when two are close, with no focus input', () => {
    // Moon is the closer-in-h/R body (0.5 R vs Earth's 1.0 R); regimeArmFor
    // takes only (current, eyeMpc, bodyStates, null) — nothing names which body is
    // focused, so an unfocused flyby past the nearer body still engages it.
    const eyeMpc: Vec3 = [m(MOON_RADIUS_M * 1.5), 0, 0];
    const bodyStates = new Map<BodyId, BodyState>([
      [bodyId('earth'), bodyState([m(EARTH_RADIUS_M * 5), 0, 0])],
      [bodyId('moon'), bodyStateAtOrigin()],
    ]);
    const next = regimeArmFor('absolute', eyeMpc, bodyStates, null);
    expect(next).toEqual({ body: 'moon' });
  });

  it('is body-blind: a small moon engages at its own 1.7 R', () => {
    const bodyStates = new Map<BodyId, BodyState>([
      [bodyId('deimos'), bodyStateAtOrigin()],
      // Earth present but far away — its own h/R stays huge, so if the
      // predicate ever floored the threshold to Earth's radius the small
      // moon would wrongly fail to engage at its own true 1.0 R.
      [bodyId('earth'), bodyState([m(EARTH_RADIUS_M * 1000), 0, 0])],
    ]);
    const next = regimeArmFor('absolute', eyeAt(DEIMOS_RADIUS_M, 1.0), bodyStates, null);
    expect(next).toEqual({ body: 'deimos' });
  });

  it('applies engageHR/disengageHR from the SURFACE_REGIME record, not a literal', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const justBelowEngage = eyeAt(EARTH_RADIUS_M, SURFACE_REGIME.engageHR - 0.01);
    const justAboveEngage = eyeAt(EARTH_RADIUS_M, SURFACE_REGIME.engageHR + 0.01);
    expect(regimeArmFor('absolute', justBelowEngage, bodyStates, null)).toEqual({ body: 'earth' });
    expect(regimeArmFor('absolute', justAboveEngage, bodyStates, null)).toBe('absolute');
  });

  it('a focus on a DIFFERENT body releases the engaged arm at any altitude (round 10)', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const current = { body: bodyId('earth') };
    // The user bug: engaged on Earth, search-focus Mars — without this the
    // camera answers only after a manual zoom-out past disengage.
    expect(regimeArmFor(current, eyeAt(EARTH_RADIUS_M, 1.05), bodyStates, 'mars')).toBe('absolute');
    expect(regimeArmFor(current, eyeAt(EARTH_RADIUS_M, 3.3), bodyStates, 'mars')).toBe('absolute');
  });

  it('focusing the engaged body itself is a no-op', () => {
    // Mutation guard: with the condition inverted, every re-focus of the
    // engaged body would pop the camera to the world arm.
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const current = { body: bodyId('earth') };
    expect(regimeArmFor(current, eyeAt(EARTH_RADIUS_M, 1.0), bodyStates, 'earth')).toEqual(current);
    expect(regimeArmFor(current, eyeAt(EARTH_RADIUS_M, 3.3), bodyStates, 'earth')).toEqual(current);
  });

  it('a differing body focus also blocks engage — the release cannot flap', () => {
    // After a focus release the eye is still inside the old body's engage
    // range; if the engage side ignored the focus, the fold would engage on
    // frame N+1 and release again on N+2, committing a flip every frame
    // until the follow ease escapes the band.
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    expect(regimeArmFor('absolute', eyeAt(EARTH_RADIUS_M, 1.0), bodyStates, 'mars')).toBe(
      'absolute',
    );
    // The focused body itself still engages normally (the common path:
    // click Earth, wheel in).
    expect(regimeArmFor('absolute', eyeAt(EARTH_RADIUS_M, 1.0), bodyStates, 'earth')).toEqual({
      body: 'earth',
    });
  });
});
