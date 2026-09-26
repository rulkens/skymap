import { describe, it, expect } from 'vitest';
import { sunCosRadius } from '../../../src/utils/camera/sunCosRadius';
import { RENDER_ORIGIN_MPC } from '../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';

const at = (au: number) =>
  sunCosRadius([
    RENDER_ORIGIN_MPC[0] + au * SCALE_UNITS.AU_TO_MPC,
    RENDER_ORIGIN_MPC[1],
    RENDER_ORIGIN_MPC[2],
  ]);
const radiusDeg = (au: number) => (Math.acos(at(au)) * 180) / Math.PI;

describe('sunCosRadius', () => {
  // The unit chain (km → Mpc against a Mpc distance) is the landmine: a slip
  // of one conversion is orders of magnitude, so pin the known discs.
  it("gives the Sun's 0.267° radius at 1 AU and 0.175° at Mars", () => {
    expect(radiusDeg(1)).toBeCloseTo(0.2666, 3);
    expect(radiusDeg(1.524)).toBeCloseTo(0.175, 3);
  });

  it('saturates to a full sky inside the photosphere instead of NaN', () => {
    expect(at(0.001)).toBe(0);
  });
});
