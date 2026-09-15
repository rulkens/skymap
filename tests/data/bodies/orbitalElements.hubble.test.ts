import { describe, it, expect } from 'vitest';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

// JPL Horizons' own geocentric state VECTOR for Hubble at the epoch its ELEMENTS
// columns were fetched at (`-48`, CENTER='500@399', REF_PLANE='FRAME', km).
// External data: the row is authored at J2000 by back-propagating M and Ω at
// their rates, so this checks the whole chain at once — the epoch shift, the
// node rate's sign, and that `FRAME` really measures Ω from the equinox where
// `planeFrameFromPole(270, 90)` puts the frame's x-axis. A frame or convention
// slip lands hundreds of km out; 10 km is 0.08° of phase on a 6852 km orbit.
const HORIZONS_EPOCH_JD = 2461298.5;
const HORIZONS_GEOCENTRIC_KM = [2792.527610933961, 5568.581049348909, -2851.366467222867];

describe('the Hubble orbit row', () => {
  it('reproduces JPL’s geocentric vector at the fetch epoch', () => {
    const states = deriveBodyStates(HORIZONS_EPOCH_JD);
    const hubble = states.get('hubble')!.positionMpc;
    const earth = states.get('earth')!.positionMpc;

    for (let axis = 0; axis < 3; axis += 1) {
      const km = (hubble[axis]! - earth[axis]!) / SCALE_UNITS.KM_TO_MPC;
      expect(Math.abs(km - HORIZONS_GEOCENTRIC_KM[axis]!)).toBeLessThan(10);
    }
  });
});
