/** formatAntiqueTuning — only moved knobs, as lines that paste into ANTIQUE_TUNING_DEFAULTS. */

import { describe, expect, it } from 'vitest';
import { formatAntiqueTuning } from '../../../../src/utils/gpu/antiqueLook/formatAntiqueTuning';
import { ANTIQUE_TUNING_DEFAULTS } from '../../../../src/data/rendering/antiqueTuning';

describe('formatAntiqueTuning', () => {
  it('is empty at the defaults', () => {
    expect(formatAntiqueTuning(ANTIQUE_TUNING_DEFAULTS, ANTIQUE_TUNING_DEFAULTS)).toBe('');
  });

  it('lists moved numbers bare, strings quoted, and switched-off rows', () => {
    const tuning = {
      ...ANTIQUE_TUNING_DEFAULTS,
      hatchUnits: 5.5,
      paperTint: '#f0e0c0' as const,
      rows: { ...ANTIQUE_TUNING_DEFAULTS.rows, figures: false, relief: false },
    };
    expect(formatAntiqueTuning(tuning, ANTIQUE_TUNING_DEFAULTS)).toBe(
      ['  hatchUnits: 5.5,', "  paperTint: '#f0e0c0',", '  rows off: figures, relief'].join('\n'),
    );
  });
});
