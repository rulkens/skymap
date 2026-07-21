import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import { ORBITAL_ELEMENTS, elementsById } from '../../../../src/data/bodies/orbitalElements';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';

const states = deriveBodyStates(CONST_J2000);

describe('deriveBodyStates', () => {
  it('returns a state for every ORBITAL_ELEMENTS id and no star id', () => {
    // Structural: catches a dropped moon (short map) or an accidentally-included
    // star (stars are OUT — a body's clock-driven state, not the local star map).
    expect(states.size).toBe(ORBITAL_ELEMENTS.length);
    for (const el of ORBITAL_ELEMENTS) {
      expect(states.has(el.id)).toBe(true);
    }
    for (const s of SCENE_STARS) {
      expect(states.has(s.id)).toBe(false);
    }
  });

  it('a moon rides its parent (Moon within its [periapsis, apoapsis] of Earth)', () => {
    // Independent orbital property, NOT a re-run of keplerianPositionMpc: the
    // geocentric distance of any point on the Moon's ellipse is bounded by its
    // periapsis a(1−e) and apoapsis a(1+e). If the parent hop were dropped (moon
    // placed heliocentric, or added to the wrong focus) this band would fail.
    const moon = states.get('moon')!;
    const earth = states.get('earth')!;
    const { semiMajorMpc: a, eccentricity: e } = elementsById('moon');
    const periapsis = a * (1 - e);
    const apoapsis = a * (1 + e);

    const dx = moon.positionMpc[0] - earth.positionMpc[0];
    const dy = moon.positionMpc[1] - earth.positionMpc[1];
    const dz = moon.positionMpc[2] - earth.positionMpc[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    expect(dist).toBeGreaterThanOrEqual(periapsis);
    expect(dist).toBeLessThanOrEqual(apoapsis);
  });

  it('orientation is identity iff the body is untextured', () => {
    // Matches orientationForBody's texture-gate contract: a textured body (Earth)
    // carries a baked IAU rotation; an untextured one (Titan) carries identity.
    expect(states.get('titan')!.orientation).toEqual([...IDENTITY_MAT3]);
    expect(states.get('earth')!.orientation).not.toEqual([...IDENTITY_MAT3]);
  });

  it('reproduces the current baked maker output exactly (zero-change proof)', () => {
    // The prep guarantee: the derive is value-identical to today's module-load
    // baked SCENE_PLANETS / SCENE_EARTH. Legitimate now because both paths still
    // exist. NOTE: Task A11 deletes the baked side — this test then compares
    // against a fixture or is retired to the structural assertions above.
    const earthState = states.get('earth')!;
    expect(earthState.positionMpc).toEqual(SCENE_EARTH.positionMpc);
    expect(earthState.orientation).toEqual(SCENE_EARTH.orientation);

    for (const body of SCENE_PLANETS) {
      const s = states.get(body.id)!;
      expect(s.positionMpc).toEqual(body.positionMpc);
      expect(s.orientation).toEqual(body.orientation);
    }
  });
});
