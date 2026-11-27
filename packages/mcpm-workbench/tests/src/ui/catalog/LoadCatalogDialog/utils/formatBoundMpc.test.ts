import { describe, expect, it } from 'vitest';
import { formatBoundMpc } from '../../../../../../src/ui/catalog/LoadCatalogDialog/utils/formatBoundMpc';

describe('formatBoundMpc', () => {
  it('writes a negative bound with a real minus sign and one decimal', () => {
    expect(formatBoundMpc(-646.53)).toBe('−646.5');
    expect(formatBoundMpc(689)).toBe('689.0');
  });

  it('writes a bound that rounds to zero without a sign', () => {
    expect(formatBoundMpc(-0.04)).toBe('0.0');
  });
});
