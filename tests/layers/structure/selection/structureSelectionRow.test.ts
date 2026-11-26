import { describe, expect, it } from 'vitest';
import { structureSelectionRow } from '../../../../src/layers/structure/selection/structureSelectionRow';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { structureRowRuntime } from '../../../support/layerPickCodes';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

const row = structureSelectionRow(structureRowRuntime({ byId: () => null, byCategory: () => [] }));
const claims = (id: string) => row.focusId!.claims(id);

describe('structureSelectionRow focus claims', () => {
  it('open-cluster and globular-cluster ids resolve to their own category', () => {
    expect(claims('open-cluster-pleiades')).toBe(true);
    expect(claims('globular-cluster-m13')).toBe(true);
  });

  it('claims a Galactic Centre place by its suffixed id and not the bare place id', () => {
    expect(claims('galactic-centre')).toBe(false);
    expect(claims('gc-cluster-arches')).toBe(true);
  });
});

describe('structureSelectionRow focus decode', () => {
  const virgo = { id: 'galaxy-cluster-virgo', category: 'galaxy-cluster' } as StructureInfo;
  const store = { byId: (id: string) => (id === virgo.id ? virgo : null), byCategory: () => [] };
  const decodeWith = (committed: boolean) =>
    structureSelectionRow({
      ...structureRowRuntime(store),
      slot: { committed: () => (committed ? ({} as never) : null) },
    }).focusId!.decode;

  it('a stored id hits; an unknown id answers by format until the bulk commits, then absent', () => {
    expect(decodeWith(true)(virgo.id)).toEqual({
      kind: 'hit',
      ref: { type: 'structure', id: virgo.id },
    });
    expect(decodeWith(false)('galaxy-cluster-nope')).toEqual({
      kind: 'hit',
      ref: { type: 'structure', id: 'galaxy-cluster-nope' },
    });
    expect(decodeWith(true)('galaxy-cluster-nope')).toEqual({ kind: 'absent' });
  });
});

describe('structureSelectionRow pick codes', () => {
  // One record per category, codes from 40 up: a row that packs a catalog value fails.
  const records = STRUCTURE_IDS.map(
    (category) => ({ id: `${category}-x`, category }) as StructureInfo,
  );
  const store = {
    byId: (id: string) => records.find((r) => r.id === id) ?? null,
    byCategory: (category: string) => records.filter((r) => r.category === category),
  };
  const row = structureSelectionRow(structureRowRuntime(store));

  it('refs round-trip under allocator codes, one per category', () => {
    const seen = new Set<number>();
    for (const { id } of records) {
      const ref = { type: 'structure', id } as const;
      const pick = unpackPick(row.encodePick(ref)!)!;
      expect(row.resolvePick(pick)).toEqual(ref);
      seen.add(pick.sourceCode);
    }
    expect(seen.size).toBe(STRUCTURE_IDS.length);
    expect([...row.pickSources].sort()).toEqual([...seen].sort());
  });
});
