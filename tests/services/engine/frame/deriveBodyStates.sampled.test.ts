import { describe, expect, it } from 'vitest';

import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';

// One module instance per test file, so the registry set here stays out of the main suite.
const T0 = 2444000.5;

describe('sampled craft in the body snapshot', () => {
  it('a craft with no track sits at Earth’s position', () => {
    const states = deriveBodyStates(T0);
    expect(states.get('voyager1')!.positionMpc).toEqual(states.get('earth')!.positionMpc);
  });

  it('a craft before its first sample sits at Earth’s position; after, on its track', () => {
    trajectoryRegistry.set({
      id: 'voyager1',
      tDays: Float64Array.from([T0, T0 + 10]),
      posKm: Float64Array.from([1e9, 0, 0, 1e9, 0, 0]),
      velKmS: new Float32Array(6),
    });
    const before = deriveBodyStates(T0 - 1);
    expect(before.get('voyager1')!.positionMpc).toEqual(before.get('earth')!.positionMpc);

    const after = deriveBodyStates(T0 + 5);
    const sun = after.get('sun')!.positionMpc;
    const v = after.get('voyager1')!.positionMpc;
    expect(v[0]).toBeCloseTo(sun[0] + 1e9 * SCALE_UNITS.KM_TO_MPC, 12);
    expect(v[1]).toBeCloseTo(sun[1], 12);
  });

  it('a track arriving on a paused clock changes the same-instant snapshot', () => {
    const t = T0 + 5;
    const first = deriveBodyStates(t).get('voyager2')!.positionMpc;
    expect(first).toEqual(deriveBodyStates(t).get('earth')!.positionMpc);
    trajectoryRegistry.set({
      id: 'voyager2',
      tDays: Float64Array.from([T0, T0 + 10]),
      posKm: Float64Array.from([0, 2e9, 0, 0, 2e9, 0]),
      velKmS: new Float32Array(6),
    });
    expect(deriveBodyStates(t).get('voyager2')!.positionMpc).not.toEqual(first);
  });
});
