import { describe, expect, it } from 'vitest';
import { weightUnitWarning } from '../../../../tools/mcpm-workbench/src/field/weightUnitWarning';

const LINEAR = { kind: 'linear', scale: 1 } as const;

describe('weightUnitWarning', () => {
  it('flags weights that look like logarithms', () => {
    expect(weightUnitWarning({ min: 8.1, median: 10.2, max: 12.34 }, LINEAR)).toEqual({
      field: 'weightKind',
      message:
        'Weights run from 8.1 to 12, which looks like log₁₀ mass. Choose "log₁₀ mass", or load anyway.',
    });
  });

  it("flags a median far above the published run's", () => {
    expect(weightUnitWarning({ min: 0.5, median: 20.4, max: 1234 }, LINEAR)).toEqual({
      field: 'scale',
      message:
        'Median weight is 20. Built-in catalogs use stellar mass in 10¹² M☉, where the median is near 0.02. For 10⁹ M☉ use a scale of 0.001, or load anyway.',
    });
  });

  it("is silent for the published run's range", () => {
    expect(weightUnitWarning({ min: 0.0001, median: 0.02, max: 3 }, LINEAR)).toBeNull();
  });

  it('is silent for a declared log column', () => {
    expect(
      weightUnitWarning({ min: 8.1, median: 10.2, max: 12.3 }, { kind: 'log10MassMsun' }),
    ).toBeNull();
  });
});
