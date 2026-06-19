/**
 * resolvePick — the registry-driven dispatch from a decoded pick to a
 * SelectionRef (identity). Tests each arm of the table:
 *
 *   - null pick → null.
 *   - galaxy catalog code → positional ref `{ type, source, index }`.
 *   - structure code → durable-id ref `{ type:'structure', id }`.
 *   - structure code with no backing record → null.
 *   - milkyWay code → singleton ref `{ type:'milkyWay' }`.
 *   - not-a-pickable-surface code → warn + null (never a ghost hit).
 *
 * The galaxy arm no longer reads the cloud (identity is positional), so
 * the "cloud not loaded" case no longer short-circuits to null — the ref
 * is committed; the reconciler handles missing-cloud at display time.
 */

import { describe, it, expect, vi } from 'vitest';

import { resolvePick } from '../../../../src/services/engine/helpers/resolvePick';
import { Source } from '../../../../src/data/sources';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { SourceType } from '../../../../src/@types/data/SourceType';
import type { ResolvePickDeps } from '../../../../src/@types/engine/ResolvePickDeps';

const virgo: StructureInfo = {
  type: 'structure',
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

/** Minimal dep fixture — only `structures` is needed now. */
function makeDeps(): ResolvePickDeps {
  return {
    structures: {
      byCategory: (cat) => (cat === 'cluster' ? [virgo] : []),
    },
  };
}

describe('resolvePick', () => {
  it('returns null for a null pick', () => {
    expect(resolvePick(null, makeDeps())).toBeNull();
  });

  it('maps a galaxy catalog code to a positional SelectionRef', () => {
    const ref = resolvePick({ sourceCode: Source.SDSS, localIdx: 1 }, makeDeps());
    expect(ref).toEqual({ type: 'galaxyCatalog', source: Source.SDSS, index: 1 });
  });

  it('maps a galaxy code regardless of whether the cloud is loaded (positional identity)', () => {
    // The galaxy arm emits a ref without touching the cloud — the reconciler
    // resolves the cloud at display time. No cloud = ref still emitted.
    const ref = resolvePick({ sourceCode: Source.SDSS, localIdx: 0 }, makeDeps());
    expect(ref).toEqual({ type: 'galaxyCatalog', source: Source.SDSS, index: 0 });
  });

  it('maps a structure code to a durable-id SelectionRef', () => {
    const ref = resolvePick({ sourceCode: Source.Cluster, localIdx: 0 }, makeDeps());
    expect(ref).toEqual({ type: 'structure', id: 'virgo' });
  });

  it('returns null when a structure hit has no backing record', () => {
    expect(resolvePick({ sourceCode: Source.Cluster, localIdx: 99 }, makeDeps())).toBeNull();
    expect(resolvePick({ sourceCode: Source.Void, localIdx: 0 }, makeDeps())).toBeNull();
  });

  it('maps a milkyWay code to the singleton SelectionRef', () => {
    const ref = resolvePick({ sourceCode: Source.MilkyWay, localIdx: 0 }, makeDeps());
    expect(ref).toEqual({ type: 'milkyWay' });
  });

  it('warns and returns null for a non-pickable code', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 30 is unallocated — no registry entry, so not galaxy catalog nor structure.
      expect(resolvePick({ sourceCode: 30 as SourceType, localIdx: 0 }, makeDeps())).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
