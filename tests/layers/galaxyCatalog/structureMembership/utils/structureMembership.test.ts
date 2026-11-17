import { describe, it, expect } from 'vitest';
import { structureMembership } from '../../../../../src/layers/galaxyCatalog/structureMembership/utils/structureMembership';
import { makeGalaxyCatalog } from '../../../../fixtures/makeGalaxyCatalog';
import { galaxyRecordsOver } from '../../../../support/galaxyRecordsOver';
import type { GalaxyCatalog } from '../../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';

/** The flat record sources over these (source, catalog) pairs, in order. */
function recordsOf(...pairs: readonly (readonly [GalaxyCatalogId, GalaxyCatalog])[]) {
  return [...galaxyRecordsOver(new Map(pairs)).values()];
}

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
    expect(structureMembership(recordsOf(['sdss', catalog]), [0, 0, 0], 10)).toBe(1);
  });

  it('sums members across multiple catalogs', () => {
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
    const count = structureMembership(recordsOf(['sdss', sdss], ['2mrs', twomrs]), [0, 0, 0], 10);
    expect(count).toBe(4);
  });
});
