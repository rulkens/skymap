import { afterEach, describe, expect, it } from 'vitest';
import { transientPositions } from '../../../src/services/bodies/transientPositions';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { surfaceFixedChain } from '../../../src/utils/camera/surfaceFixedChain';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import type { TransientBodyId } from '../../../src/@types/scene/TransientBodyId';

const ID: TransientBodyId = 'transient:probe';
afterEach(() => transientPositions.delete(ID));

describe('transientPositions in deriveBodyStates', () => {
  it('places a transient object after the bodies it hangs off', () => {
    transientPositions.set(ID, (_simDays, positions) => {
      const earth = positions.get(asSceneBodyId('earth'))!;
      return [earth[0] + 1e-15, earth[1], earth[2]];
    });
    const states = deriveBodyStates(CONST_J2000);
    expect(states.get(ID)!.positionMpc[0]).toBe(
      states.get(asSceneBodyId('earth'))!.positionMpc[0] + 1e-15,
    );
  });

  it('recomputes the memo when one is added or removed on a paused clock', () => {
    const before = deriveBodyStates(CONST_J2000 + 1);
    expect(before.has(ID)).toBe(false);
    transientPositions.set(ID, () => [1, 2, 3]);
    expect(deriveBodyStates(CONST_J2000 + 1).has(ID)).toBe(true);
    transientPositions.delete(ID);
    expect(deriveBodyStates(CONST_J2000 + 1).has(ID)).toBe(false);
  });

  it('gives a transient id a chain of its own: no body-table row, no host', () => {
    expect(surfaceFixedChain(ID)).toEqual([ID]);
  });
});
