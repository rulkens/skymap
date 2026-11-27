import { describe, expect, it } from 'vitest';
import { formatStatsSummary } from '../../../../../../src/ui/sim/StatsSummary/utils/formatStatsSummary';

const MB_142 = 142 * 1024 ** 2;

describe('formatStatsSummary', () => {
  it('joins step, frame rate and GPU memory', () => {
    expect(formatStatsSummary(1240, 60, MB_142)).toBe(
      `step ${(1240).toLocaleString()} · 60 fps · 142.0 MB`,
    );
  });

  it('drops the frame rate until one is measured, keeping step 0', () => {
    expect(formatStatsSummary(0, 0, MB_142)).toBe('step 0 · 142.0 MB');
  });
});
