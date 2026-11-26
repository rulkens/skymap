import { describe, expect, it } from 'vitest';
import { weightUnitWarning } from '../../../../../../tools/mcpm-workbench/src/catalog/weights/weightUnitWarning';

const LINEAR = { kind: 'linear', scale: 1 } as const;

describe('weightUnitWarning', () => {
  it('flags weights that look like logarithms', () => {
    const warning = weightUnitWarning({ min: 8.1, median: 10.2, max: 12.34 }, LINEAR);
    expect(warning?.field).toBe('weightKind');
    expect(warning?.message).toMatch(/from 8\.1 to 12\b.*log₁₀ mass/);
  });

  it("flags a median far above the published run's", () => {
    const warning = weightUnitWarning({ min: 0.5, median: 20.4, max: 1234 }, LINEAR);
    expect(warning?.field).toBe('scale');
    expect(warning?.message).toMatch(/Median weight is 20\b/);
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
