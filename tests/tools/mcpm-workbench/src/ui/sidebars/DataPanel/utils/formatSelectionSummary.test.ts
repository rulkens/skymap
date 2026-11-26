import { describe, expect, it } from 'vitest';
import { formatSelectionSummary } from '../../../../../../../../tools/mcpm-workbench/src/ui/sidebars/DataPanel/utils/formatSelectionSummary';

describe('formatSelectionSummary', () => {
  it('keeps each axis in order, a block off a whole Mpc included', () => {
    expect(formatSelectionSummary([198.4, 204, 150])).toBe('198.4 × 204 × 150 Mpc');
  });
});
