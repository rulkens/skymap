/**
 * SCENE_S_STARS — the 40 drawn records, and the two registries they must join.
 *
 * The seed→record map itself is a one-liner the compiler checks. What can break
 * silently is membership: an S-star absent from `SCENE_BODIES` produces NO
 * InfoCard and no search hit, with a `null` and no error anywhere in the path.
 */

import { describe, it, expect } from 'vitest';
import { SCENE_S_STARS } from '../../../src/data/bodies/sceneSStars';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { selectionResolverOver } from '../../support/selectionResolverOver';
import { rankPaletteMatches } from '../../../src/components/CommandPalette/utils/rankPaletteMatches';
import { Source } from '../../../src/data/sources';
import { CONST_J2000 } from '../../../src/data/time/constJ2000';
import type { StarRowFixture } from '../../support/selectionResolverOver';

/** The seeded star arms read no store data, so an empty fixture suffices — the
 *  star row needs no survey catalog to resolve a seed. */
const resolver = selectionResolverOver(
  { structures: { byId: () => null, byCategory: () => [] } },
  undefined,
  { renderer: { loadedCatalogs: () => [][Symbol.iterator]() } } as unknown as StarRowFixture,
);

describe('SCENE_S_STARS', () => {
  it('shares no id with the famous-star map', () => {
    // The two seed tables are concatenated into one store list and one
    // `SCENE_BODIES`, and every lookup downstream is by id: a collision would
    // silently merge two stars, route one's pick to the other's table, and give
    // `SCENE_BODIES.find` a coin toss. Gillessen's S-numbering and the famous
    // atlas share no naming scheme today, which is exactly why nothing else
    // would notice a future clash.
    const famous = new Set(SCENE_STARS.map((star) => star.id));
    expect(SCENE_S_STARS.filter((star) => famous.has(star.id)).map((star) => star.id)).toEqual([]);
  });

  it('picking an S-star materialises a star ref the seed table can resolve', () => {
    // Two halves of one path, and both fail by returning null rather than
    // throwing: the pick decodes through the star Layer's row, whose `extractRow`
    // then reads the S-star seed table. Omitting either leaves a click that
    // highlights nothing and opens no card. Membership in `SCENE_BODIES` is still
    // asserted because the camera and occluder readers walk it.
    const s2Index = SCENE_S_STARS.findIndex((star) => star.id === 's2');
    expect(s2Index).toBeGreaterThanOrEqual(0);

    const ref = resolver.resolvePick({ sourceCode: Source.SStar, localIdx: s2Index });
    expect(ref).toEqual({ type: 'starCatalog', source: Source.SStar, index: s2Index });
    expect(resolver.extractRow(ref, CONST_J2000)).toMatchObject({ id: 's2', label: 'S2' });

    expect(SCENE_BODIES.some((body) => body.id === 's2')).toBe(true);
  });

  it('S2 is findable by name, and the other new rows do not swamp another query', () => {
    // Searchability is a free consequence of the seed table the palette scores
    // over, so this is the reachable end of the same registration. The second
    // half is the cost side: 40 short, digit-bearing labels are exactly the
    // shape that pollutes unrelated queries.
    const s2Rows = rankPaletteMatches([], [], [], [], 'S2').filter(
      (row) => row.kind === 'starCatalog' && row.star.id === 's2',
    );
    expect(s2Rows).toHaveLength(1);

    const siriusRows = rankPaletteMatches([], [], [], [], 'Sirius');
    expect(siriusRows[0]).toMatchObject({ kind: 'starCatalog', star: { id: 'sirius' } });
  });
});
