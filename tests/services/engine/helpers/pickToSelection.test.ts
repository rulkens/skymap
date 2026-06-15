/**
 * pickToSelection — the shared decode → Selection map used by both the click
 * and hover paths. Tests the registry-driven classification:
 *
 *   - null pick → null.
 *   - galaxy catalog code → a galaxy Selection (no store touch).
 *   - structure code → a structure Selection carrying the record's id (via byCategory).
 *   - structure code with no backing record → null.
 *   - not-a-pickable-surface code → warn + null (never a ghost hit).
 */

import { describe, it, expect, vi } from 'vitest';

import { pickToSelection } from '../../../../src/services/engine/helpers/pickToSelection';
import { Source } from '../../../../src/data/sources';
import type { StructureRecord } from '../../../../src/@types/data/structure/StructureRecord';
import type { PickStructureStore } from '../../../../src/@types/engine/data/PickStructureStore';
import type { SourceType } from '../../../../src/@types/data/SourceType';

const virgo: StructureRecord = {
  id: 'virgo',
  name: 'Virgo Cluster',
  category: 'cluster',
  worldPos: [10, 0, 0],
  featured: true,
  physicalRadiusMpc: 2,
};

const structures: PickStructureStore = {
  byCategory: (cat) => (cat === 'cluster' ? [virgo] : []),
};

describe('pickToSelection', () => {
  it('returns null for a null pick', () => {
    expect(pickToSelection(null, structures)).toBeNull();
  });

  it('maps a galaxy catalog code to a galaxy Selection', () => {
    expect(pickToSelection({ sourceCode: Source.SDSS, localIdx: 7 }, structures)).toEqual({
      kind: 'galaxy',
      source: Source.SDSS,
      localIdx: 7,
    });
  });

  it('maps a structure code to a structure Selection carrying the record id', () => {
    expect(pickToSelection({ sourceCode: Source.Cluster, localIdx: 0 }, structures)).toEqual({
      kind: 'structure',
      id: virgo.id,
    });
  });

  it('returns null when a structure hit has no backing record', () => {
    expect(pickToSelection({ sourceCode: Source.Cluster, localIdx: 99 }, structures)).toBeNull();
    expect(pickToSelection({ sourceCode: Source.Void, localIdx: 0 }, structures)).toBeNull();
  });

  it('warns and returns null for a code that is not a pickable surface', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // 14 is unallocated — no registry entry, so not galaxy catalog nor structure.
      expect(pickToSelection({ sourceCode: 14 as SourceType, localIdx: 0 }, structures)).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
