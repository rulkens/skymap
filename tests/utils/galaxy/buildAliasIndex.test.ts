/**
 * Tests for the pure alias-index builder extracted from `useAliasIndex`.
 *
 * The builder walks the engine's per-source `objIDs` arrays and joins
 * each non-zero PGC against an alias map (PGC → display names).  Pure
 * function so we can hammer every branch in node without spinning up
 * React or an engine.
 */

import { describe, it, expect } from 'vitest';
import { buildAliasIndex } from '../../../src/utils/galaxy/buildAliasIndex';
import { Source } from '../../../src/data/sources';
import type { EngineHandle } from '../../../src/@types/engine/EngineHandle';
import type { SourceType } from '../../../src/@types/data/SourceType';

/**
 * Build a minimal `EngineHandle` whose only live method is
 * `sources.getCloudObjIds`.  Cast through `unknown` because the real
 * handle has ~30 methods we don't care about for this test.
 */
const fakeHandle = (objIdsBySource: Partial<Record<SourceType, BigUint64Array>>): EngineHandle =>
  ({
    sources: {
      getCloudObjIds: (s: SourceType) => objIdsBySource[s],
    },
  }) as unknown as EngineHandle;

describe('buildAliasIndex', () => {
  it('emits one entry per (source, localIdx) where the PGC has aliases', () => {
    const handle = fakeHandle({
      [Source.Glade]: new BigUint64Array([100n, 200n, 300n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([
      [100n, ['NGC 1']],
      [300n, ['NGC 3']],
    ]);
    const out = buildAliasIndex({
      handle,
      aliasMap,
      sources: [Source.Glade],
    });
    expect(out).toEqual([
      { pgc: 100n, names: ['NGC 1'], source: Source.Glade, localIdx: 0 },
      { pgc: 300n, names: ['NGC 3'], source: Source.Glade, localIdx: 2 },
    ]);
  });

  it('skips zero PGCs (unmatched cross-match rows)', () => {
    const handle = fakeHandle({
      [Source.Glade]: new BigUint64Array([0n, 100n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([[100n, ['NGC 1']]]);
    const out = buildAliasIndex({
      handle,
      aliasMap,
      sources: [Source.Glade],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.pgc).toBe(100n);
  });

  it('skips PGCs whose alias list is empty', () => {
    const handle = fakeHandle({
      [Source.Glade]: new BigUint64Array([100n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([[100n, []]]);
    expect(buildAliasIndex({ handle, aliasMap, sources: [Source.Glade] })).toEqual([]);
  });

  it('returns empty when a source is not loaded', () => {
    const handle = fakeHandle({}); // no clouds
    const aliasMap = new Map<bigint, readonly string[]>([[100n, ['NGC 1']]]);
    expect(
      buildAliasIndex({
        handle,
        aliasMap,
        sources: [Source.Glade, Source.TwoMRS],
      }),
    ).toEqual([]);
  });

  it('walks multiple sources in order', () => {
    const handle = fakeHandle({
      [Source.Glade]: new BigUint64Array([100n]),
      [Source.TwoMRS]: new BigUint64Array([200n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([
      [100n, ['G']],
      [200n, ['T']],
    ]);
    const out = buildAliasIndex({
      handle,
      aliasMap,
      sources: [Source.Glade, Source.TwoMRS],
    });
    expect(out.map((e) => e.source)).toEqual([Source.Glade, Source.TwoMRS]);
    expect(out.map((e) => e.localIdx)).toEqual([0, 0]);
  });
});
