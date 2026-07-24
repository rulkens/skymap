import { describe, it, expect } from 'vitest';
import { structureMembership } from '../../../src/utils/structure/structureMembership';
import { Source } from '../../../src/data/sources';
import { packSelection } from '../../../src/data/selectionEncoding';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

/**
 * Build a minimal GalaxyCatalog from a list of (x,y,z) tuples.
 * Only the `positions` + `count` fields are read by structureMembership;
 * the other Float32Array slots are filled with zeros via `new
 * Float32Array(count)` so the type's required-field shape is satisfied
 * without polluting the test fixture with irrelevant data.
 */
function makeCatalog(positions: ReadonlyArray<readonly [number, number, number]>): GalaxyCatalog {
  const count = positions.length;
  const flat = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    flat[i * 3 + 0] = positions[i]![0];
    flat[i * 3 + 1] = positions[i]![1];
    flat[i * 3 + 2] = positions[i]![2];
  }
  return makeGalaxyCatalog(count, { positions: flat });
}

describe('structureMembership — pure cone search', () => {
  it('classifies one inside, one boundary, one outside galaxy', () => {
    const catalog = makeCatalog([
      [5, 0, 0],
      [10, 0, 0],
      [20, 0, 0],
    ]);
    const result = structureMembership([{ source: Source.SDSS, catalog }], [0, 0, 0], 10);
    expect(result.count).toBe(1);
    expect(result.packedIds).toEqual([packSelection(Source.SDSS, 0)]);
  });

  it('uses strict less-than (galaxy on boundary excluded)', () => {
    const catalog = makeCatalog([[0, 0, 10]]);
    const result = structureMembership([{ source: Source.TwoMRS, catalog }], [0, 0, 0], 10);
    expect(result.count).toBe(0);
    expect(result.packedIds).toEqual([]);
  });

  it('merges members across multiple catalogs with correct source codes', () => {
    const sdss = makeCatalog([
      [1, 0, 0], // inside
      [2, 0, 0], // inside
      [100, 0, 0], // outside
    ]);
    const twomrs = makeCatalog([
      [0, 1, 0], // inside
      [0, 2, 0], // inside
      [0, 100, 0], // outside
    ]);
    const result = structureMembership(
      [
        { source: Source.SDSS, catalog: sdss },
        { source: Source.TwoMRS, catalog: twomrs },
      ],
      [0, 0, 0],
      10,
    );
    expect(result.count).toBe(4);
    expect(result.packedIds).toEqual([
      packSelection(Source.SDSS, 0),
      packSelection(Source.SDSS, 1),
      packSelection(Source.TwoMRS, 0),
      packSelection(Source.TwoMRS, 1),
    ]);
  });

  it('returns {count: 0, packedIds: []} for empty catalogs', () => {
    const result = structureMembership([], [0, 0, 0], 10);
    expect(result.count).toBe(0);
    expect(result.packedIds).toEqual([]);
  });

  it('returns {count: 0, packedIds: []} when every input catalog is empty', () => {
    const empty = makeCatalog([]);
    const result = structureMembership(
      [
        { source: Source.SDSS, catalog: empty },
        { source: Source.TwoMRS, catalog: empty },
      ],
      [0, 0, 0],
      10,
    );
    expect(result.count).toBe(0);
    expect(result.packedIds).toEqual([]);
  });
});
