import { describe, it, expect } from 'vitest';
import { STAR_CATALOG_BODY_ROWS } from '../../../../src/layers/starCatalog/bodies/starCatalogBodyRows';
import { SEEDED_STAR_CATALOGS } from '../../../../src/data/bodies/seededStarCatalogs';
import { isPlanetBody } from '../../../../src/utils/scene/isPlanetBody';

describe('STAR_CATALOG_BODY_ROWS', () => {
  // A seeded star with no row has no position: it draws nowhere and its focus link resolves null.
  it('every seeded star is a body row, once', () => {
    const rowIds = STAR_CATALOG_BODY_ROWS.map((row) => row.body.id);
    const seededIds = Object.values(SEEDED_STAR_CATALOGS).flatMap((stars) =>
      stars.map((star) => star.id),
    );
    expect(new Set(rowIds).size).toBe(rowIds.length);
    expect([...rowIds].sort()).toEqual([...seededIds].sort());
  });

  // `SCENE_PLANETS` decodes picks by position and the star rows come first in the registry: a
  // star that passed `isPlanetBody` would renumber every planet pick.
  it('no star row is a planet', () => {
    expect(STAR_CATALOG_BODY_ROWS.filter((row) => isPlanetBody(row.body))).toEqual([]);
  });
});
