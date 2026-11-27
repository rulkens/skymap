import { describe, expect, it } from 'vitest';
import { concatCatalogPoints } from '../../../src/catalog/concatCatalogPoints';

describe('concatCatalogPoints', () => {
  it('concatCatalogPoints joins positions, weights and counts in order', () => {
    const joined = concatCatalogPoints([
      {
        positions: new Float32Array([1, 2, 3]),
        weight: new Float32Array([0.5]),
        count: 1,
        sources: ['sdss'],
      },
      {
        positions: new Float32Array([4, 5, 6, 7, 8, 9]),
        weight: new Float32Array([0.1, 0.2]),
        count: 2,
        sources: [],
      },
    ]);

    expect(Array.from(joined.positions)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Array.from(joined.weight)).toEqual([0.5, 0.1, 0.2].map(Math.fround));
    expect(joined.count).toBe(3);
    expect(joined.sources).toEqual(['sdss']);
  });

  // A loaded file near the 400 MB cap with every built-in off would otherwise sit in memory twice.
  it('hands the only non-empty part back without copying it, keeping every source', () => {
    const file = {
      positions: new Float32Array([4, 5, 6]),
      weight: new Float32Array([0.1]),
      count: 1,
      sources: [],
    };
    const empty = { positions: new Float32Array(), weight: new Float32Array(), count: 0 };

    const joined = concatCatalogPoints([{ ...empty, sources: ['sdss'] }, file]);

    expect(joined.positions).toBe(file.positions);
    expect(joined.weight).toBe(file.weight);
    expect(joined.count).toBe(1);
    expect(joined.sources).toEqual(['sdss']);
  });
});
