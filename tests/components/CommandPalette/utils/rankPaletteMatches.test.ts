import { describe, it, expect } from 'vitest';
import { rankPaletteMatches } from '../../../../src/components/CommandPalette/utils/rankPaletteMatches';
import { Source } from '../../../../src/data/sources';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import type { AliasIndexEntry } from '../../../../src/@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../../../src/@types/engine/StructureSearchEntry';

const M31: FamousMetaEntry = {
  id: 'm31',
  names: ['M31', 'Andromeda Galaxy'],
  description: 'The nearest large spiral.',
  type: 'Sb',
};

const COMA: StructureSearchEntry = {
  id: 'cluster-coma',
  name: 'Coma Cluster',
  category: 'cluster',
  abell: 'A1656',
  description: 'X-ray cluster · z = 0.023',
};

function alias(names: readonly string[], localIdx: number): AliasIndexEntry {
  return { pgc: BigInt(localIdx), names, source: Source.Glade, localIdx };
}

function structure(name: string, abell: string | null, idx: number): StructureSearchEntry {
  return { id: `cluster-bulk-x${idx}`, name, category: 'cluster', abell, description: '' };
}

describe('rankPaletteMatches', () => {
  it('empty query → Milky Way heads the list, then all famous, no alias/structure rows', () => {
    const rows = rankPaletteMatches([M31], [alias(['NGC 4565'], 1)], [COMA], '');
    expect(rows[0]?.kind).toBe('milkyWay');
    expect(rows.filter((r) => r.kind === 'famous')).toHaveLength(1);
    expect(rows.some((r) => r.kind === 'alias')).toBe(false);
    expect(rows.some((r) => r.kind === 'structure')).toBe(false);
  });

  it('ranks an equally-matching famous row above an alias row (famous tiebreak)', () => {
    // Both the famous name and the alias name are exactly "Foo", so without
    // the tiebreak they would tie on raw score.
    const famous: FamousMetaEntry = { id: 'foo', names: ['Foo'], description: '', type: '' };
    const rows = rankPaletteMatches([famous], [alias(['Foo'], 7)], [], 'foo');
    const famousIdx = rows.findIndex((r) => r.kind === 'famous');
    const aliasIdx = rows.findIndex((r) => r.kind === 'alias');
    expect(famousIdx).toBeGreaterThanOrEqual(0);
    expect(aliasIdx).toBeGreaterThanOrEqual(0);
    expect(famousIdx).toBeLessThan(aliasIdx);
  });

  it('caps alias rows at 50', () => {
    const many = Array.from({ length: 60 }, (_, i) => alias(['MCGtest'], i));
    const rows = rankPaletteMatches([], many, [], 'mcgtest');
    expect(rows.filter((r) => r.kind === 'alias')).toHaveLength(50);
  });

  it('surfaces a structure by primary name', () => {
    const rows = rankPaletteMatches([M31], [], [COMA], 'coma');
    const hit = rows.find((r) => r.kind === 'structure');
    expect(hit?.kind === 'structure' && hit.entry.id).toBe('cluster-coma');
  });

  it('surfaces a structure by its Abell number', () => {
    const rows = rankPaletteMatches([], [], [COMA], 'a1656');
    expect(rows.some((r) => r.kind === 'structure' && r.entry.id === 'cluster-coma')).toBe(true);
  });

  it('shows no structure rows for an empty query (browse = famous only)', () => {
    const rows = rankPaletteMatches([M31], [], [COMA], '');
    expect(rows.some((r) => r.kind === 'structure')).toBe(false);
  });

  it('caps structure rows at 50', () => {
    const many = Array.from({ length: 60 }, (_, i) => structure('Abelltest', null, i));
    const rows = rankPaletteMatches([], [], many, 'abelltest');
    expect(rows.filter((r) => r.kind === 'structure')).toHaveLength(50);
  });

  it('tolerates an undefined structure index', () => {
    const rows = rankPaletteMatches([M31], [], undefined, 'm31');
    expect(rows.some((r) => r.kind === 'famous')).toBe(true);
  });

  it('surfaces a Milky Way row for the query "milky way"', () => {
    const rows = rankPaletteMatches([M31], [], [], 'milky way');
    expect(rows.some((r) => r.kind === 'milkyWay')).toBe(true);
  });

  it('yields no Milky Way row for a query that matches nothing', () => {
    const rows = rankPaletteMatches([M31], [], [], 'zzznotathing');
    expect(rows.some((r) => r.kind === 'milkyWay')).toBe(false);
  });
});
