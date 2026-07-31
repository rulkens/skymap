import { describe, it, expect } from 'vitest';
import { rankPaletteMatches } from '../../../../src/components/CommandPalette/utils/rankPaletteMatches';
import { focusIdForRow } from '../../../../src/components/CommandPalette/utils/focusIdForRow';
import { resolveFocusId } from '../../../../src/services/url/resolveFocusId';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { Source } from '../../../../src/data/sources';
import type { FamousGalaxyMetaEntry } from '../../../../src/@types/loading/FamousGalaxyMetaEntry';
import type { AliasIndexEntry } from '../../../../src/@types/engine/AliasIndexEntry';
import type { ResolveDeps } from '../../../../src/@types/engine/ResolveDeps';
import type { StructureSearchEntry } from '../../../../src/@types/engine/StructureSearchEntry';

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

// The body branch of the focus-id decoder reads SCENE_BODIES (a static import)
// and nothing else, so an all-empty deps object is enough to resolve one.
const EMPTY_RESOLVE_DEPS: ResolveDeps = {
  catalogs: { get: () => undefined },
  famousGalaxiesMeta: [],
  structures: { byId: () => null },
  stars: { current: () => null },
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
    const famous: FamousGalaxyMetaEntry = { id: 'foo', names: ['Foo'], description: '', type: '' };
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

describe('rankPaletteMatches — scene-body rows', () => {
  it("surfaces Earth for the query 'earth'", () => {
    const rows = rankPaletteMatches([M31], [], [], 'earth');
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
    const rows = rankPaletteMatches([earthlyFamous], [], [], 'earth');
    const bodyIdx = rows.findIndex((r) => r.kind === 'body' && r.body.id === 'earth');
    const famousIdx = rows.findIndex((r) => r.kind === 'famous');
    expect(bodyIdx).toBeGreaterThanOrEqual(0);
    expect(famousIdx).toBeGreaterThanOrEqual(0);
    expect(bodyIdx).toBeLessThan(famousIdx);
  });

  it('shows no body rows on an empty query (browse = famous + MW)', () => {
    const rows = rankPaletteMatches([M31], [], [], '');
    expect(rows.some((r) => r.kind === 'body')).toBe(false);
  });

  it('yields no body row for a query that matches no body name', () => {
    const rows = rankPaletteMatches([M31], [], [], 'zzznotathing');
    expect(rows.some((r) => r.kind === 'body')).toBe(false);
  });

  it('a star is findable by its Bayer alias without the deepZoom gate', () => {
    // No deepZoom URL gate is set, yet a query for Sirius's Bayer designation
    // (not its common name) surfaces the Sirius body row — pins both the ungate
    // and the alias scoring over the star's full names[].
    const rows = rankPaletteMatches([M31], [], [], 'Alpha Canis Majoris');
    const hit = rows.find((r) => r.kind === 'body');
    expect(hit?.kind === 'body' && hit.body.id).toBe('sirius');
  });

  it('finds Sgr A* by its Sagittarius alias', () => {
    // Sgr A* has no famous-star row, so before the alias lookup widened it was
    // scored on its label 'Sgr A*' alone and this query matched nothing — its id
    // ('sgr-a-star') does not contain 'sagittarius' either.
    const rows = rankPaletteMatches([M31], [], [], 'sagittarius');
    expect(rows.some((r) => r.kind === 'body' && r.body.id === 'sgr-a-star')).toBe(true);
  });

  it('resolves the Sgr A* row to a body focus id', () => {
    // The palette only names the thing; the decoder returns null for any id
    // absent from SCENE_BODIES, so this is what a registration gap would break.
    const rows = rankPaletteMatches([M31], [], [], 'sagittarius');
    const row = rows.find((r) => r.kind === 'body' && r.body.id === 'sgr-a-star')!;
    const focusId = focusIdForRow(row);
    expect(focusId).toBe('body-sgr-a-star');
    expect(resolveFocusId(focusId, EMPTY_RESOLVE_DEPS)).toEqual({
      type: 'body',
      id: 'sgr-a-star',
    });
  });
});
