import { describe, expect, it } from 'vitest';
import { deriveGridBox } from '../../../../../../../tools/mcpm-workbench/src/grid/deriveGridBox';
import { defaultGridSlice } from '../../../../../../../tools/mcpm-workbench/src/state/grid/gridSlice';
import { formatSelectionSummary } from '../../../../../../../tools/mcpm-workbench/src/ui/sidebars/DataPanel/utils/formatSelectionSummary';

describe('formatSelectionSummary', () => {
  it('reads the default box as the size sliders do', () => {
    expect(formatSelectionSummary(deriveGridBox(defaultGridSlice).sizeMpc)).toBe(
      '204 × 204 × 204 Mpc',
    );
  });

  it('keeps each axis in order, a block off a whole Mpc included', () => {
    expect(formatSelectionSummary([198.4, 204, 150])).toBe('198.4 × 204 × 150 Mpc');
  });
});
