/**
 * sumProvenanceCounts accumulates each source's provenance tally into one
 * totals row, and returns all-zeros (not null) when nothing has landed yet.
 */

import { describe, it, expect } from 'vitest';
import { sumProvenanceCounts } from '../../src/utils/sumProvenanceCounts';
import { Source } from '../../src/data/sources';

describe('sumProvenanceCounts', () => {
  it('accumulates total and per-axis estimated counts across sources', () => {
    const bySource = {
      [Source.SDSS]: { total: 10, estimated: { orientation: 2, size: 1 } },
      [Source.Glade]: { total: 5, estimated: { orientation: 0, size: 3 } },
    };

    expect(sumProvenanceCounts(bySource)).toEqual({
      total: 15,
      estimated: { orientation: 2, size: 4 },
    });
  });

  it('returns all-zeros when no source has reported', () => {
    expect(sumProvenanceCounts({})).toEqual({
      total: 0,
      estimated: { orientation: 0, size: 0 },
    });
  });
});
