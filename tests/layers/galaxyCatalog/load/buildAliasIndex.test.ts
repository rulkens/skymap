/**
 * Tests for the pure alias-index builder. It walks each requested source's
 * per-catalog `objIDs` array and joins each non-zero PGC against an alias map
 * (PGC → display names). Pure function so every branch (zero PGC, missing
 * source, empty names) is hammered in node without an engine.
 */

import { describe, it, expect } from 'vitest';
import { buildAliasIndex } from '../../../../src/layers/galaxyCatalog/load/buildAliasIndex';
import { Source } from '../../../../src/data/sources';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';
import type { SourceType } from '../../../../src/@types/data/SourceType';

/** Only `objIDs` is read by the builder. */
const fakeCatalogs = (
  objIdsBySource: Partial<Record<SourceType, BigUint64Array>>,
): Map<SourceType, GalaxyCatalog> => {
  const catalogs = new Map<SourceType, GalaxyCatalog>();
  for (const [source, objIDs] of Object.entries(objIdsBySource)) {
    catalogs.set(Number(source) as SourceType, { objIDs } as unknown as GalaxyCatalog);
  }
  return catalogs;
};

describe('buildAliasIndex', () => {
  it('emits one entry per (source, localIdx) where the PGC has aliases', () => {
    const catalogs = fakeCatalogs({
      [Source.Glade]: new BigUint64Array([100n, 200n, 300n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([
      [100n, ['NGC 1']],
      [300n, ['NGC 3']],
    ]);
    const out = buildAliasIndex({
      catalogs,
      aliasMap,
      sources: [Source.Glade],
    });
    expect(out).toEqual([
      { pgc: 100, names: ['NGC 1'], source: Source.Glade, localIdx: 0 },
      { pgc: 300, names: ['NGC 3'], source: Source.Glade, localIdx: 2 },
    ]);
  });

  it('skips zero PGCs (unmatched cross-match rows)', () => {
    const catalogs = fakeCatalogs({
      [Source.Glade]: new BigUint64Array([0n, 100n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([[100n, ['NGC 1']]]);
    const out = buildAliasIndex({
      catalogs,
      aliasMap,
      sources: [Source.Glade],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.pgc).toBe(100);
  });

  it('skips PGCs whose alias list is empty', () => {
    const catalogs = fakeCatalogs({
      [Source.Glade]: new BigUint64Array([100n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([[100n, []]]);
    expect(buildAliasIndex({ catalogs, aliasMap, sources: [Source.Glade] })).toEqual([]);
  });

  it('returns empty when a source is not loaded', () => {
    const catalogs = fakeCatalogs({}); // no clouds
    const aliasMap = new Map<bigint, readonly string[]>([[100n, ['NGC 1']]]);
    expect(
      buildAliasIndex({
        catalogs,
        aliasMap,
        sources: [Source.Glade, Source.TwoMRS],
      }),
    ).toEqual([]);
  });

  it('walks multiple sources in order', () => {
    const catalogs = fakeCatalogs({
      [Source.Glade]: new BigUint64Array([100n]),
      [Source.TwoMRS]: new BigUint64Array([200n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([
      [100n, ['G']],
      [200n, ['T']],
    ]);
    const out = buildAliasIndex({
      catalogs,
      aliasMap,
      sources: [Source.Glade, Source.TwoMRS],
    });
    expect(out.map((e) => e.source)).toEqual([Source.Glade, Source.TwoMRS]);
    expect(out.map((e) => e.localIdx)).toEqual([0, 0]);
  });
});
