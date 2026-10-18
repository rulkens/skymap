/**
 * Tests for the pure alias-index builder. It joins each non-zero PGC of an
 * alias map (PGC → display names) against every pgc-claiming record source's
 * `hasDurableId`. Pure function so every branch (zero PGC, missing source,
 * empty names) is hammered in node without an engine.
 */

import { describe, it, expect } from 'vitest';
import { buildAliasIndex } from '../../../../src/layers/galaxyCatalog/load/buildAliasIndex';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import { galaxyRecordsOver } from '../../../support/galaxyRecordsOver';

/** The flat record sources over catalogs carrying only these `objIDs`. */
const fakeCatalogs = (objIdsBySource: Partial<Record<SourceType, BigUint64Array>>) => {
  const catalogs = new Map<SourceType, GalaxyCatalog>();
  for (const [source, objIDs] of Object.entries(objIdsBySource)) {
    catalogs.set(Number(source) as SourceType, makeGalaxyCatalog(objIDs.length, { objIDs }));
  }
  return galaxyRecordsOver(catalogs).values();
};

describe('buildAliasIndex', () => {
  it('emits one entry per (source, localIdx) where the PGC has aliases', () => {
    const records = fakeCatalogs({
      [Source.Glade]: new BigUint64Array([100n, 200n, 300n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([
      [100n, ['NGC 1']],
      [300n, ['NGC 3']],
    ]);
    const out = buildAliasIndex({ records, aliasMap });
    expect(out).toEqual([
      { pgc: 100, names: ['NGC 1'], source: Source.Glade, localIdx: 0 },
      { pgc: 300, names: ['NGC 3'], source: Source.Glade, localIdx: 2 },
    ]);
  });

  it('skips zero PGCs (unmatched cross-match rows)', () => {
    const records = fakeCatalogs({
      [Source.Glade]: new BigUint64Array([0n, 100n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([[100n, ['NGC 1']]]);
    const out = buildAliasIndex({ records, aliasMap });
    expect(out).toHaveLength(1);
    expect(out[0]!.pgc).toBe(100);
  });

  it('skips PGCs whose alias list is empty', () => {
    const records = fakeCatalogs({
      [Source.Glade]: new BigUint64Array([100n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([[100n, []]]);
    expect(buildAliasIndex({ records, aliasMap })).toEqual([]);
  });

  it('returns empty when a source is not loaded', () => {
    const records = fakeCatalogs({}); // no clouds
    const aliasMap = new Map<bigint, readonly string[]>([[100n, ['NGC 1']]]);
    expect(buildAliasIndex({ records, aliasMap })).toEqual([]);
  });

  it('walks multiple sources in order', () => {
    const records = fakeCatalogs({
      [Source.Glade]: new BigUint64Array([100n]),
      [Source.TwoMRS]: new BigUint64Array([200n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([
      [100n, ['G']],
      [200n, ['T']],
    ]);
    const out = buildAliasIndex({ records, aliasMap });
    expect(out.map((e) => e.source)).toEqual([Source.Glade, Source.TwoMRS]);
    expect(out.map((e) => e.localIdx)).toEqual([0, 0]);
  });
});
