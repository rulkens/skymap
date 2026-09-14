import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

// JPL Horizons' own heliocentric range for each probe at the epoch its element
// columns were fetched at. External data: the rows are authored at J2000 from
// `Tp`, so the figure below is produced by nothing in this repo and checks the
// whole chain at once — the epoch shift, the unwrapped mean anomaly, the
// hyperbolic solver's sign conventions and the perifocal→world frame. Three
// decimals is the precision the figure is PUBLISHED to (±5e-4 au); the residual
// is 9e-5 au on Voyager 1 and 2.4e-4 au on Voyager 2, both inside it.
const HORIZONS_EPOCH_JD = 2461294.5;

describe('the Voyager orbit rows', () => {
  it.each([
    ['voyager1', 171.722],
    ['voyager2', 143.912],
  ])('%s reproduces JPL’s heliocentric range at the fetch epoch', (id, expectedAu) => {
    const states = deriveBodyStates(HORIZONS_EPOCH_JD);
    const probe = states.get(id)!.positionMpc;
    const sun = states.get('sun')!.positionMpc;
    const rangeAu =
      Math.hypot(probe[0] - sun[0], probe[1] - sun[1], probe[2] - sun[2]) / SCALE_UNITS.AU_TO_MPC;

    expect(rangeAu).toBeCloseTo(expectedAu, 3);
  });
});
