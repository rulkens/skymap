/**
 * constellationOfBody — the constellation a scene body sits in, `undefined` when
 * it sits in none.
 *
 * The seed table spells "in no constellation" as the literal string `'None'`
 * (the Sun's row), which every display site would otherwise render as a
 * constellation called "None". Collapsing the sentinel here keeps its knowledge
 * in one place instead of at each chip.
 */

import { FAMOUS_STAR_SEARCH } from '../../data/bodies/famousStarsIndex';

const NO_CONSTELLATION = 'None';

export function constellationOfBody(bodyId: string): string | undefined {
  const constellation = FAMOUS_STAR_SEARCH.get(bodyId)?.constellation;
  return constellation === NO_CONSTELLATION ? undefined : constellation;
}
