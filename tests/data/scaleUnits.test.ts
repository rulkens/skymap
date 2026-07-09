import { describe, it, expect } from 'vitest';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { PC_TO_LY } from '../../src/utils/math/constants';

describe('SCALE_UNITS', () => {
  describe('exact unit conversions', () => {
    it('PC_TO_MPC equals 1e-6', () => {
      expect(SCALE_UNITS.PC_TO_MPC).toBe(1e-6);
    });

    it('KPC_TO_MPC equals 1e-3', () => {
      expect(SCALE_UNITS.KPC_TO_MPC).toBe(1e-3);
    });

    it('MPC_TO_MPC equals 1', () => {
      expect(SCALE_UNITS.MPC_TO_MPC).toBe(1);
    });

    it('GPC_TO_MPC equals 1e3', () => {
      expect(SCALE_UNITS.GPC_TO_MPC).toBe(1e3);
    });
  });

  describe('derived unit conversions (floating-point)', () => {
    it('KM_TO_MPC is computed from PC_IN_KM = 3.0856775814913673e13', () => {
      const PC_IN_KM = 3.0856775814913673e13;
      const expectedKmToMpc = 1e-6 / PC_IN_KM;
      expect(SCALE_UNITS.KM_TO_MPC).toBeCloseTo(expectedKmToMpc);
    });

    it('AU_TO_MPC is computed from AU_IN_KM = 1.495978707e8 and KM_TO_MPC', () => {
      const AU_IN_KM = 1.495978707e8;
      const PC_IN_KM = 3.0856775814913673e13;
      const KM_TO_MPC = 1e-6 / PC_IN_KM;
      const expectedAuToMpc = AU_IN_KM * KM_TO_MPC;
      expect(SCALE_UNITS.AU_TO_MPC).toBeCloseTo(expectedAuToMpc);
    });

    it('LY_TO_MPC equals 1e-6 / PC_TO_LY', () => {
      const expectedLyToMpc = 1e-6 / PC_TO_LY;
      expect(SCALE_UNITS.LY_TO_MPC).toBeCloseTo(expectedLyToMpc);
    });
  });

  describe('internal consistency', () => {
    it('KPC_TO_MPC / PC_TO_MPC equals 1000 (1 kpc = 1000 pc)', () => {
      expect(SCALE_UNITS.KPC_TO_MPC / SCALE_UNITS.PC_TO_MPC).toBeCloseTo(1000);
    });

    it('GPC_TO_MPC / MPC_TO_MPC equals 1000 (1 Gpc = 1000 Mpc)', () => {
      expect(SCALE_UNITS.GPC_TO_MPC / SCALE_UNITS.MPC_TO_MPC).toBe(1000);
    });

    it('AU_TO_MPC / KM_TO_MPC equals AU_IN_KM = 1.495978707e8', () => {
      const AU_IN_KM = 1.495978707e8;
      expect(SCALE_UNITS.AU_TO_MPC / SCALE_UNITS.KM_TO_MPC).toBeCloseTo(AU_IN_KM);
    });
  });
});
