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
  catalogSlice,
  defaultCatalogSlice,
} from '../../../../tools/mcpm-workbench/src/state/slices/catalogSlice';

const { actions, reducer } = catalogSlice;

const points = {
  positions: new Float32Array([1, 2, 3]),
  log10StellarMass: new Float32Array([4]),
  count: 1,
  sources: [],
};

describe('catalogSlice setPackedCatalog', () => {
  it('installs the override and mirrors setCatalogLoaded', () => {
    const next = reducer(
      defaultCatalogSlice,
      actions.setPackedCatalog({ points, nanFillCount: 2, sourceName: 'sdssGalaxy_metadata.txt' }),
    );

    expect(next.loadStatus).toBe('loaded');
    expect(next.pointCount).toBe(1);
    expect(next.nanFillCount).toBe(2);
    expect(next.packedOverride).toBe(points);
    expect(next.packedSourceName).toBe('sdssGalaxy_metadata.txt');
    expect(next.packedDropId).toBe(1);
    expect(next.catalogBoundsMpc).toEqual({ min: [1, 2, 3], max: [1, 2, 3] });
  });

  it('bumps packedDropId on every install, even a same-filename re-drop', () => {
    const first = reducer(
      defaultCatalogSlice,
      actions.setPackedCatalog({ points, nanFillCount: 2, sourceName: 'sdssGalaxy_metadata.txt' }),
    );
    const second = reducer(
      first,
      actions.setPackedCatalog({ points, nanFillCount: 0, sourceName: 'sdssGalaxy_metadata.txt' }),
    );

    expect(second.packedDropId).toBe(2);
    expect(second.packedDropId).not.toBe(first.packedDropId);
  });
});

describe('catalogSlice zero-point status', () => {
  it('setCatalogLoaded clears a stale statusMessage — a real load must supersede it', () => {
    const stale = reducer(
      defaultCatalogSlice,
      actions.setCatalogStatusMessage('no catalog points'),
    );

    const loaded = reducer(
      stale,
      actions.setCatalogLoaded({ pointCount: 1, nanFillCount: 0, boundsMpc: null }),
    );

    expect(loaded.statusMessage).toBeNull();
  });
});

describe('catalogSlice setCatalogBuildError', () => {
  it('routes the thrown error message into statusMessage verbatim, marked error', () => {
    const refusalMessage =
      "createMcpmHarness: trace needs 900000000 bytes, over this device's " +
      '268435456-byte limit. Largest long axis that fits: 512.';

    const next = reducer(defaultCatalogSlice, actions.setCatalogBuildError(refusalMessage));

    expect(next.loadStatus).toBe('error');
    expect(next.statusMessage).toBe(refusalMessage);
  });

  it('a later successful load clears it, same as any other statusMessage', () => {
    const failed = reducer(defaultCatalogSlice, actions.setCatalogBuildError('over budget'));

    const loaded = reducer(
      failed,
      actions.setCatalogLoaded({ pointCount: 5, nanFillCount: 0, boundsMpc: null }),
    );

    expect(loaded.loadStatus).toBe('loaded');
    expect(loaded.statusMessage).toBeNull();
  });
});
