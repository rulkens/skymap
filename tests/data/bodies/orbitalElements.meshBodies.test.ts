import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import { SCENE_EARTH } from '../../../src/data/bodies/sceneEarth';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

describe('the whale and petunias orbit rows', () => {
  it('the petunia pot trails the whale by the authored mean-anomaly offset at epoch', () => {
    // Spec's authored "roughly 40 m behind the whale along the orbit". Radians
    // ARE arc length over radius, so this is an independent geometric check —
    // not a mirror of the degrees-based arc-length formula the row itself uses
    // to derive its meanAnomalyDeg.
    const states = deriveBodyStates(CONST_J2000);
    const whale = states.get('whale')!;
    const petunias = states.get('petunias')!;
    const semiMajorMetres = SCENE_EARTH.radiusM + 400_000;
    const expectedOffsetRad = 40 / semiMajorMetres;

    expect(whale.meanAnomalyRad - petunias.meanAnomalyRad).toBeCloseTo(expectedOffsetRad, 10);

    // Physical sanity check: both bodies actually sit in the ~400 km orbit,
    // not on top of Earth or off at some other radius.
    const earth = states.get('earth')!;
    const expectedRadiusMpc = semiMajorMetres * SCALE_UNITS.M_TO_MPC;
    for (const body of [whale, petunias]) {
      const dx = body.positionMpc[0] - earth.positionMpc[0];
      const dy = body.positionMpc[1] - earth.positionMpc[1];
      const dz = body.positionMpc[2] - earth.positionMpc[2];
      const dist = Math.hypot(dx, dy, dz);
      expect(dist).toBeCloseTo(expectedRadiusMpc, 15);
    }
  });

  it('every SCENE_BODIES id resolves a BodyState', () => {
    // Guards extractSelectionRow.ts's non-null assertion
    // (`deriveBodyStates(simDays).get(body.id)!`). Trivially green today; it
    // becomes load-bearing the moment a seed row is added without its
    // ORBITAL_ELEMENTS / SCENE_ANCHORS counterpart.
    const states = deriveBodyStates(CONST_J2000);
    for (const body of SCENE_BODIES) {
      expect(states.get(body.id), `state for '${body.id}'`).toBeDefined();
    }
  });
});
