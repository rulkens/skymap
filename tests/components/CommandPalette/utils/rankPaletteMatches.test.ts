import { describe, it, expect } from 'vitest';
import { rankPaletteMatches } from '../../../../src/components/CommandPalette/utils/rankPaletteMatches';
import { Source } from '../../../../src/data/sources';
import type { FamousMetaEntry } from '../../../../src/@types/loading/FamousMetaEntry';
import type { AliasIndexEntry } from '../../../../src/@types/engine/AliasIndexEntry';

const M31: FamousMetaEntry = {
  id: 'm31',
  names: ['M31', 'Andromeda Galaxy'],
  description: 'The nearest large spiral.',
  type: 'Sb',
};

function alias(names: readonly string[], localIdx: number): AliasIndexEntry {
  return { pgc: BigInt(localIdx), names, source: Source.Glade, localIdx };
}

describe('rankPaletteMatches', () => {
  it('empty query → Milky Way heads the list, then all famous, no alias rows', () => {
    const rows = rankPaletteMatches([M31], [alias(['NGC 4565'], 1)], '');
    expect(rows[0]?.kind).toBe('milkyWay');
    expect(rows.filter((r) => r.kind === 'famous')).toHaveLength(1);
    expect(rows.some((r) => r.kind === 'alias')).toBe(false);
  });

  it('ranks an equally-matching famous row above an alias row (famous tiebreak)', () => {
    // Both the famous name and the alias name are exactly "Foo", so without
    // the tiebreak they would tie on raw score.
    const famous: FamousMetaEntry = { id: 'foo', names: ['Foo'], description: '', type: '' };
    const rows = rankPaletteMatches([famous], [alias(['Foo'], 7)], 'foo');
    const famousIdx = rows.findIndex((r) => r.kind === 'famous');
    const aliasIdx = rows.findIndex((r) => r.kind === 'alias');
    expect(famousIdx).toBeGreaterThanOrEqual(0);
    expect(aliasIdx).toBeGreaterThanOrEqual(0);
    expect(famousIdx).toBeLessThan(aliasIdx);
  });

  it('caps alias rows at 50', () => {
    const many = Array.from({ length: 60 }, (_, i) => alias(['MCGtest'], i));
    const rows = rankPaletteMatches([], many, 'mcgtest');
    expect(rows.filter((r) => r.kind === 'alias')).toHaveLength(50);
  });

  it('surfaces a Milky Way row for the query "milky way"', () => {
    const rows = rankPaletteMatches([M31], [], 'milky way');
    expect(rows.some((r) => r.kind === 'milkyWay')).toBe(true);
  });

  it('yields no Milky Way row for a query that matches nothing', () => {
    const rows = rankPaletteMatches([M31], [], 'zzznotathing');
    expect(rows.some((r) => r.kind === 'milkyWay')).toBe(false);
  });
});
