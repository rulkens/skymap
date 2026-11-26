import { describe, expect, it } from 'vitest';
import { LOG10_DISPLAYED } from '../../../../../../tools/mcpm-workbench/src/ui/panel/data/log10Displayed.constant';

describe('LOG10_DISPLAYED', () => {
  it('shows a log10 value as the number it came from, without float dust', () => {
    for (const shown of [3.125, 12.4, 500, 0.75, 1e-5]) {
      expect(String(LOG10_DISPLAYED.fromValue(LOG10_DISPLAYED.toValue(shown)))).toBe(String(shown));
    }
  });
});
