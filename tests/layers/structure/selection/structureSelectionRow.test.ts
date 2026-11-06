import { describe, expect, it } from 'vitest';
import { structureSelectionRow } from '../../../../src/layers/structure/selection/structureSelectionRow';
import { STRUCTURE_IDS } from '../../../../src/data/structure/structureIds';
import { unpackPick } from '../../../../src/data/selectionEncoding';
import { fakePickCode } from '../../../support/fakePickCode';
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

describe('structureSelectionRow pick codes', () => {
  // One record per category, codes from 40 up: a row that packs a catalog value fails.
  const records = STRUCTURE_IDS.map(
    (category) => ({ id: `${category}-x`, category }) as StructureInfo,
  );
  const store = {
    byId: (id: string) => records.find((r) => r.id === id) ?? null,
    byCategory: (category: string) => records.filter((r) => r.category === category),
  };
  const row = structureSelectionRow(structureRowRuntime(store, fakePickCode()));

  it('refs round-trip under non-catalog codes, one per category', () => {
    const seen = new Set<number>();
    for (const { id } of records) {
      const ref = { type: 'structure', id } as const;
      const pick = unpackPick(row.encodePick(ref)!)!;
      expect(pick.sourceCode).toBeGreaterThanOrEqual(40);
      expect(row.resolvePick(pick)).toEqual(ref);
      seen.add(pick.sourceCode);
    }
    expect(seen.size).toBe(STRUCTURE_IDS.length);
    expect([...row.pickSources].sort()).toEqual([...seen].sort());
  });
});
