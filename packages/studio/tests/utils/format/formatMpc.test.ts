import { describe, expect, it } from 'vitest';
import { formatMpc } from '../../../src/utils/format/formatMpc';

describe('formatMpc', () => {
  it('steps down the ladder instead of rounding a small distance to 0 Mpc', () => {
    expect(formatMpc(0.03)).toBe('30.0 kpc');
    expect(formatMpc(0.785)).toBe('785 kpc');
    expect(formatMpc(300)).toBe('300 Mpc');
  });
});
