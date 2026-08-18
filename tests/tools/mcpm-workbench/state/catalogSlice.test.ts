/**
 * catalogSlice — `setPackedCatalog` must reuse `setCatalogLoaded`'s
 * transition (loadStatus/pointCount/nanFillCount) rather than a parallel
 * one, or the packed-drop path and the network-load path could drift.
 */
import { describe, expect, it } from 'vitest';
import {
  defaultCatalogSlice,
  setPackedCatalog,
} from '../../../../tools/mcpm-workbench/src/state/slices/catalogSlice';

describe('catalogSlice setPackedCatalog', () => {
  it('installs the override and mirrors setCatalogLoaded', () => {
    const points = {
      positions: new Float32Array([1, 2, 3]),
      log10StellarMass: new Float32Array([4]),
      count: 1,
      sources: [],
    };
    const next = setPackedCatalog(defaultCatalogSlice, points, 2, 'sdssGalaxy_metadata.txt');

    expect(next.loadStatus).toBe('loaded');
    expect(next.pointCount).toBe(1);
    expect(next.nanFillCount).toBe(2);
    expect(next.packedOverride).toBe(points);
    expect(next.packedSourceName).toBe('sdssGalaxy_metadata.txt');
  });
});
