/**
 * starSearch — each seeded star's row id must decode, through the Layer's own
 * focusId, back to that star; otherwise Enter on a star row selects the wrong
 * one or nothing.
 */

import { describe, it, expect } from 'vitest';

import { starSearch } from '../../../../../src/layers/starCatalog/selection/present/starSearch';
import { starCatalogSelectionRow } from '../../../../../src/layers/starCatalog/selection/present/starCatalogSelectionRow';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../../../src/data/bodies/seededStarCatalogsBySource';
import type { LayerSearchEntry } from '../../../../../src/@types/engine/layer/LayerSearchEntry';
import type { StarCatalogRuntime } from '../../../../../src/layers/starCatalog/@types/StarCatalogRuntime';

async function rows(): Promise<readonly LayerSearchEntry[]> {
  const snapshots = [];
  for await (const batch of starSearch()) snapshots.push(batch);
  expect(snapshots).toHaveLength(1);
  return snapshots[0]!;
}

const SEEDED = [...SEEDED_STAR_CATALOGS_BY_SOURCE].flatMap(([source, row]) =>
  row.stars.map((star, index) => ({ source, index, star })),
);

describe('starSearch', () => {
  it('emits one primary row per seeded star', async () => {
    const all = await rows();
    expect(all).toHaveLength(SEEDED.length);
    expect(all.every((r) => r.class === 'primary')).toBe(true);
  });

  it('every id decodes to its own star', async () => {
    // Seed ids never look like bin indices, so decode needs no loaded survey.
    const runtime = { renderer: { loadedCatalogs: () => [] } } as unknown as StarCatalogRuntime;
    const focusId = starCatalogSelectionRow(runtime).focusId!;
    const all = await rows();
    SEEDED.forEach(({ source, index }, i) => {
      expect(focusId.claims(all[i]!.id)).toBe(true);
      expect(focusId.decode(all[i]!.id)).toEqual({ type: 'starCatalog', source, index });
    });
  });

  it('keeps the names and chip the old row showed', async () => {
    const all = await rows();
    const sirius = all.find((r) => r.id === 'star-sirius')!;
    expect(sirius.names[0]).toBe('Sirius');
    expect(sirius.names).toContain('Alpha Canis Majoris');
    expect(sirius.chip).toBe('Canis Major');
    const sun = all.find((r) => r.id === 'star-sun')!;
    expect(sun.names).toContain('Sol');
    expect(sun.chip).toBe('Solar System');
  });
});
