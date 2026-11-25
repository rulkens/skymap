import { describe, expect, it } from 'vitest';
import { massWeightFromLog10 } from '../../../../tools/mcpm-workbench/src/field/massWeightFromLog10';

describe('massWeightFromLog10', () => {
  it('massWeightFromLog10 maps 12 to 1 and 9 to 0.001', () => {
    expect(massWeightFromLog10(12)).toBe(1);
    expect(massWeightFromLog10(9)).toBeCloseTo(0.001, 12);
  });

  it('keeps NaN', () => {
    expect(massWeightFromLog10(NaN)).toBeNaN();
  });
});
