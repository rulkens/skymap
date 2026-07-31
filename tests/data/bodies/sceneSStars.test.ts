/**
 * SCENE_S_STARS — the 39 drawn records, and the two registries they must join.
 *
 * The seed→record map itself is a one-liner the compiler checks. What can break
 * silently is membership: an S-star absent from `SCENE_BODIES` produces NO
 * InfoCard and no search hit, with a `null` and no error anywhere in the path.
 */

import { describe, it, expect } from 'vitest';
import { SCENE_S_STARS } from '../../../src/data/bodies/sceneSStars';
import { SCENE_STARS } from '../../../src/data/bodies/sceneStars';
import { SCENE_BODIES } from '../../../src/data/bodies/sceneBodies';
import { resolvePick } from '../../../src/services/engine/helpers/resolvePick';
import { rankPaletteMatches } from '../../../src/components/CommandPalette/utils/rankPaletteMatches';
import { Source } from '../../../src/data/sources';
import type { ResolvePickDeps } from '../../../src/@types/engine/ResolvePickDeps';

/** The body arms read no store data, so a stub structure store suffices. */
const pickDeps: ResolvePickDeps = { structures: { byCategory: () => [] } };

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

  it('picking an S-star materialises a body ref that SCENE_BODIES can resolve', () => {
    // Two halves of one path, and both fail by returning null rather than
    // throwing: the pick decodes through `PICK_SEEDS_BY_BODY_ID`'s `s-star` row,
    // and `extractSelectionRow` then looks the id up in `SCENE_BODIES`. Omitting
    // either leaves a click that highlights nothing and opens no card.
    const s2Index = SCENE_S_STARS.findIndex((star) => star.id === 's2');
    expect(s2Index).toBeGreaterThanOrEqual(0);

    const ref = resolvePick({ sourceCode: Source.SStar, localIdx: s2Index }, pickDeps);
    expect(ref).toEqual({ type: 'body', id: 's2' });

    expect(SCENE_BODIES.some((body) => body.id === 's2')).toBe(true);
  });

  it('S2 is findable by name, and the 39 new rows do not swamp another query', () => {
    // Searchability is a free consequence of `SCENE_BODIES` membership — the
    // palette scores every row — so this is the reachable end of the same
    // registration. The second half is the cost side: 39 short, digit-bearing
    // labels are exactly the shape that pollutes unrelated queries.
    const s2Rows = rankPaletteMatches([], [], [], 'S2').filter(
      (row) => row.kind === 'body' && row.body.id === 's2',
    );
    expect(s2Rows).toHaveLength(1);

    const siriusRows = rankPaletteMatches([], [], [], 'Sirius');
    expect(siriusRows[0]).toMatchObject({ kind: 'body', body: { id: 'sirius' } });
  });
});
