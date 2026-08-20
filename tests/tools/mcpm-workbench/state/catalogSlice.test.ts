/**
 * catalogSlice — `setPackedCatalog` must reuse `setCatalogLoaded`'s
 * transition (loadStatus/pointCount/nanFillCount) rather than a parallel
 * one, or the packed-drop path and the network-load path could drift.
 * `packedDropId` must increment even across same-name drops — it, not the
 * filename, is Viewport's rebuild-trigger key (review finding: the fork
 * exports under one default filename every run).
 */
import { describe, expect, it } from 'vitest';
import {
  defaultCatalogSlice,
  setCatalogBuildError,
  setCatalogLoaded,
  setCatalogStatusMessage,
  setPackedCatalog,
} from '../../../../tools/mcpm-workbench/src/state/slices/catalogSlice';

const points = {
  positions: new Float32Array([1, 2, 3]),
  log10StellarMass: new Float32Array([4]),
  count: 1,
  sources: [],
};

describe('catalogSlice setPackedCatalog', () => {
  it('installs the override and mirrors setCatalogLoaded', () => {
    const next = setPackedCatalog(defaultCatalogSlice, points, 2, 'sdssGalaxy_metadata.txt');

    expect(next.loadStatus).toBe('loaded');
    expect(next.pointCount).toBe(1);
    expect(next.nanFillCount).toBe(2);
    expect(next.packedOverride).toBe(points);
    expect(next.packedSourceName).toBe('sdssGalaxy_metadata.txt');
    expect(next.packedDropId).toBe(1);
    expect(next.catalogBoundsMpc).toEqual({ min: [1, 2, 3], max: [1, 2, 3] });
  });

  it('bumps packedDropId on every install, even a same-filename re-drop', () => {
    const first = setPackedCatalog(defaultCatalogSlice, points, 2, 'sdssGalaxy_metadata.txt');
    const second = setPackedCatalog(first, points, 0, 'sdssGalaxy_metadata.txt');

    expect(second.packedDropId).toBe(2);
    expect(second.packedDropId).not.toBe(first.packedDropId);
  });
});

describe('catalogSlice zero-point status', () => {
  it('setCatalogLoaded clears a stale statusMessage — a real load must supersede it', () => {
    const stale = setCatalogStatusMessage(defaultCatalogSlice, 'no catalog points');

    const loaded = setCatalogLoaded(stale, 1, 0, null);

    expect(loaded.statusMessage).toBeNull();
  });
});

describe('catalogSlice setCatalogBuildError', () => {
  it('routes the thrown error message into statusMessage verbatim, marked error', () => {
    const refusalMessage =
      "createMcpmHarness: trace needs 900000000 bytes, over this device's " +
      '268435456-byte limit. Largest long axis that fits: 512.';

    const next = setCatalogBuildError(defaultCatalogSlice, refusalMessage);

    expect(next.loadStatus).toBe('error');
    expect(next.statusMessage).toBe(refusalMessage);
  });

  it('a later successful load clears it, same as any other statusMessage', () => {
    const failed = setCatalogBuildError(defaultCatalogSlice, 'over budget');

    const loaded = setCatalogLoaded(failed, 5, 0, null);

    expect(loaded.loadStatus).toBe('loaded');
    expect(loaded.statusMessage).toBeNull();
  });
});
