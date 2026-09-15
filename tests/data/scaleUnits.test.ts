import { describe, it, expect } from 'vitest';
import { SCALE_UNITS } from '../../src/data/scaleUnits';

describe('SCALE_UNITS', () => {
  describe('internal consistency', () => {
    it('KPC_TO_MPC / PC_TO_MPC equals 1000 (1 kpc = 1000 pc)', () => {
      expect(SCALE_UNITS.KPC_TO_MPC / SCALE_UNITS.PC_TO_MPC).toBeCloseTo(1000);
    });

    it('AU_TO_MPC / KM_TO_MPC equals AU_IN_KM = 1.495978707e8', () => {
      const AU_IN_KM = 1.495978707e8;
      expect(SCALE_UNITS.AU_TO_MPC / SCALE_UNITS.KM_TO_MPC).toBeCloseTo(AU_IN_KM);
    });
  });
});
