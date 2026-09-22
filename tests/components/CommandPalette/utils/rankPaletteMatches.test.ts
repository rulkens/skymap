import { describe, it, expect } from 'vitest';
import { rankPaletteMatches } from '../../../../src/components/CommandPalette/utils/rankPaletteMatches';
import { actionForRow } from '../../../../src/components/CommandPalette/utils/actionForRow';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { Source } from '../../../../src/data/sources';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../../src/@types/engine/AliasIndexEntry';
import type { StructureSearchEntry } from '../../../../src/@types/engine/StructureSearchEntry';
import type { LayerSearchEntry } from '../../../../src/@types/engine/layer/LayerSearchEntry';

const M31: FamousGalaxyMetaEntry = {
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
  return { pgc: localIdx, names, source: Source.Glade, localIdx };
}

function structure(name: string, abell: string | null, idx: number): StructureSearchEntry {
  return { id: `cluster-bulk-x${idx}`, name, category: 'cluster', abell, description: '' };
}

describe('rankPaletteMatches', () => {
  it('empty query yields no rows — the featured grid owns browsing', () => {
    const rows = rankPaletteMatches([M31], [alias(['NGC 4565'], 1)], [COMA], [], '');
    expect(rows).toEqual([]);
  });

  it('ranks an equally-matching famous row above an alias row (famous tiebreak)', () => {
    // Both the famous name and the alias name are exactly "Foo", so without
    // the tiebreak they would tie on raw score.
    const famous: FamousGalaxyMetaEntry = { id: 'foo', names: ['Foo'], description: '', type: '' };
    const rows = rankPaletteMatches([famous], [alias(['Foo'], 7)], [], [], 'foo');
    const famousIdx = rows.findIndex((r) => r.kind === 'famous');
    const aliasIdx = rows.findIndex((r) => r.kind === 'alias');
    expect(famousIdx).toBeGreaterThanOrEqual(0);
    expect(aliasIdx).toBeGreaterThanOrEqual(0);
    expect(famousIdx).toBeLessThan(aliasIdx);
  });

  it('caps alias rows at 50', () => {
    const many = Array.from({ length: 60 }, (_, i) => alias(['MCGtest'], i));
    const rows = rankPaletteMatches([], many, [], [], 'mcgtest');
    expect(rows.filter((r) => r.kind === 'alias')).toHaveLength(50);
  });

  it('surfaces a structure by primary name', () => {
    const rows = rankPaletteMatches([M31], [], [COMA], [], 'coma');
    const hit = rows.find((r) => r.kind === 'structure');
    expect(hit?.kind === 'structure' && hit.entry.id).toBe('cluster-coma');
  });

  it('surfaces a structure by its Abell number', () => {
    const rows = rankPaletteMatches([], [], [COMA], [], 'a1656');
    expect(rows.some((r) => r.kind === 'structure' && r.entry.id === 'cluster-coma')).toBe(true);
  });

  it('tolerates an undefined structure index', () => {
    const rows = rankPaletteMatches([M31], [], undefined, [], 'm31');
    expect(rows.some((r) => r.kind === 'famous')).toBe(true);
  });

  it('surfaces a Milky Way row for the query "milky way"', () => {
    const rows = rankPaletteMatches([M31], [], [], [], 'milky way');
    expect(rows.some((r) => r.kind === 'milkyWay')).toBe(true);
  });

  it('yields no Milky Way row for a query that matches nothing', () => {
    const rows = rankPaletteMatches([M31], [], [], [], 'zzznotathing');
    expect(rows.some((r) => r.kind === 'milkyWay')).toBe(false);
  });
});

describe('rankPaletteMatches — scene-body rows', () => {
  it("surfaces Earth for the query 'earth'", () => {
    const rows = rankPaletteMatches([M31], [], [], [], 'earth');
    const hit = rows.find((r) => r.kind === 'body');
    expect(hit?.kind === 'body' && hit.body.id).toBe('earth');
    expect(hit?.kind === 'body' && hit.body).toBe(SCENE_EARTH);
  });

  it('ranks an exact body match above a famous row that only matched in its description', () => {
    // A famous entry whose *description* contains 'earth' scores low (~15);
    // Earth the scene body is an exact *name* match (~1000). The body must
    // outrank the famous row, even though famous rows are otherwise listed
    // first — the regression the sectioned concatenation used to cause.
    const earthlyFamous: FamousGalaxyMetaEntry = {
      id: 'ngc-earthish',
      names: ['NGC 9999'],
      description: 'A galaxy visible from Earth on a clear night.',
      type: 'Sc',
    };
    const rows = rankPaletteMatches([earthlyFamous], [], [], [], 'earth');
    const bodyIdx = rows.findIndex((r) => r.kind === 'body' && r.body.id === 'earth');
    const famousIdx = rows.findIndex((r) => r.kind === 'famous');
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(famousIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeLessThan(famousIdx);
  });

  it('a star is findable by its Bayer alias, on a star row', () => {
    // A query for Sirius's Bayer designation (not its common name) surfaces the
    // Sirius STAR row — pins the alias scoring over the star's full names[] and
    // that a star ranks as a star, not as a body (spec §7).
    const rows = rankPaletteMatches([M31], [], [], [], 'Alpha Canis Majoris');
    const hit = rows.find((r) => r.kind === 'starCatalog');
    expect(hit?.kind === 'starCatalog' && hit.star.id).toBe('sirius');
    expect(rows.some((r) => r.kind === 'body' && r.body.id === 'sirius')).toBe(false);
  });

  it('finds the Sun by its authored alias, and never as a body row', () => {
    // The Sun is its own seeded catalog with no famous-star seed row, so its
    // aliases live in the authored half of BODY_SEARCH_NAMES; scoring stars off
    // that same map is what keeps 'Sol' finding it.
    const rows = rankPaletteMatches([M31], [], [], [], 'Sol');
    const hit = rows.find((r) => r.kind === 'starCatalog');
    expect(hit?.kind === 'starCatalog' && hit.star.id).toBe('sun');
    expect(rows.some((r) => r.kind === 'body' && r.body.id === 'sun')).toBe(false);
  });

  it('finds Sgr A* by its Sagittarius alias', () => {
    // Sgr A* has no famous-star row, so before the alias lookup widened it was
    // scored on its label 'Sgr A*' alone and this query matched nothing — its id
    // ('sgr-a-star') does not contain 'sagittarius' either.
    const rows = rankPaletteMatches([M31], [], [], [], 'sagittarius');
    expect(rows.some((r) => r.kind === 'body' && r.body.id === 'sgr-a-star')).toBe(true);
  });

  it('keeps dev tours out of search while user-facing ones rank', () => {
    // `demoTour` is a harness for the tour machinery and carries `dev: true`.
    // Nothing else hides it: it is a full `tourRegistry` row, so its label
    // scores like any other and only the flag keeps it out of a user's results.
    expect(rankPaletteMatches([M31], [], [], [], 'demo tour')).toEqual([]);
    const rows = rankPaletteMatches([M31], [], [], [], 'named cosmic web');
    expect(rows.some((r) => r.kind === 'tour' && r.tour.id === 'webShowcase')).toBe(true);
  });
});

describe('rankPaletteMatches — Layer-published rows', () => {
  function layerRow(id: string, cls: 'primary' | 'catalog'): LayerSearchEntry {
    return { id, names: ['Zztest'], ref: { type: 'milkyWay' }, class: cls };
  }

  it('a primary layer row outranks a capped catalog row', () => {
    // Same name on every row, so only `class` can order them: the primary row
    // joins the uncapped primary list, the 60 catalog rows compete for the
    // 50-row alias budget.
    const published = [
      ...Array.from({ length: 60 }, (_, i) => layerRow(`catalog-${i}`, 'catalog')),
      layerRow('primary', 'primary'),
    ];
    const rows = rankPaletteMatches([], [], [], published, 'zztest').filter(
      (r) => r.kind === 'layer',
    );
    expect(rows[0]).toMatchObject({ entry: { id: 'primary' } });
    expect(rows).toHaveLength(51);
  });

  it('layer rows are absent when the list is empty', () => {
    expect(rankPaletteMatches([], [], [], [], 'zztest')).toEqual([]);
  });
});

describe('rankPaletteMatches — Earth place rows', () => {
  it("surfaces Paris for the query 'paris'", () => {
    const rows = rankPaletteMatches([], [], [], [], 'paris');
    expect(rows.some((r) => r.kind === 'place' && r.entry.id === 'paris')).toBe(true);
  });

  it("surfaces Søndermarken for the query 'sondermarken' (no diacritic)", () => {
    const rows = rankPaletteMatches([], [], [], [], 'sondermarken');
    expect(rows.some((r) => r.kind === 'place' && r.entry.id === 'sondermarken')).toBe(true);
  });
});
