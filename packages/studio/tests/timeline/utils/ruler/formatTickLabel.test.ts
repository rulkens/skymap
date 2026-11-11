import { describe, expect, it } from 'vitest';
import { formatTickLabel } from '../../../../src/timeline/utils/ruler/formatTickLabel';

describe('formatTickLabel', () => {
  it('reads seconds below a minute, the first with its unit', () => {
    expect(formatTickLabel(30, true)).toBe('30 s');
    expect(formatTickLabel(2.5, false)).toBe('2.5');
    expect(formatTickLabel(59.9, false)).toBe('59.9');
  });

  it('reads m:ss from a minute on, like the playhead', () => {
    expect(formatTickLabel(60, true)).toBe('1:00');
    expect(formatTickLabel(125, false)).toBe('2:05');
    expect(formatTickLabel(90.5, false)).toBe('1:30.5');
  });
});
